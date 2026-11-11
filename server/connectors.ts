import { mkdirSync } from "node:fs";
import type { Bot, Connector, ConnectorAccess, ConnectorCheck, ConnectorStatus } from "../shared/types";
import { publish } from "./bus";
import { LOCAL_BASE } from "./config";
import * as db from "./db";
import { access, bearer, detect, finishSignIn, hasStaticAuth, needsDetect, needsToken, onAuthChange, renew } from "./oauth";
import { launchFor, providers } from "./providers";
import type { CheckResult, RunConnector } from "./providers/types";

const CHECK_MS = 45_000;
const NO_TOKEN = new Set<ConnectorAccess["auth"]>(["needed", "expired", "failed"]);

export const findConnector = (id: string) => db.listConnectors().find((c) => c.id === id) ?? null;

const detecting = new Set<string>();
const checking = new Set<string>();
const pair = (botId: string, connectorId: string) => `${botId}:${connectorId}`;
let queue: Promise<unknown> = Promise.resolve();

const usersOf = (connectorId: string) => db.listBots().filter((b) => b.connectorIds.includes(connectorId)).map((b) => b.id);

onAuthChange((connectorId) => {
  db.clearChecks({ connectorId });
  publish({ type: "connectors" });
  const c = findConnector(connectorId);
  if (c && access(c).auth === "signed-in") void checkBots(usersOf(connectorId), connectorId);
});

function detectLater(c: Connector) {
  if (detecting.has(c.id)) return;
  detecting.add(c.id);
  void detect(c)
    .catch(() => {})
    .finally(() => {
      detecting.delete(c.id);
      publish({ type: "connectors" });
    });
}

function checkFor(bot: Bot, a: ConnectorAccess, saved: ConnectorCheck | undefined): ConnectorCheck {
  const base: ConnectorCheck = { botId: bot.id, connectorId: a.connectorId, state: "unchecked", tools: [], detail: "", checkedAt: null };
  if (!providers[bot.provider].checkConnectors) return { ...base, state: "unsupported" };
  if (checking.has(pair(bot.id, a.connectorId))) return { ...base, state: "checking" };
  if (NO_TOKEN.has(a.auth)) return { ...base, state: "auth" };
  if (a.auth === "error") return { ...base, state: "failed", detail: a.problem };
  return saved ?? base;
}

export function connectorStatus(): ConnectorStatus {
  const connectors = db.listConnectors();
  for (const c of connectors) if (needsDetect(c)) detectLater(c);
  const accesses = connectors.map(access);
  const saved = new Map(db.listChecks().map((r) => [pair(r.botId, r.connectorId), r]));
  const checks = db.listBots().flatMap((bot) =>
    connectors
      .filter((c) => c.kind === "http" && bot.connectorIds.includes(c.id))
      .map((c) => checkFor(bot, accesses.find((a) => a.connectorId === c.id)!, saved.get(pair(bot.id, c.id)))),
  );
  return { access: accesses, checks, callbackUrl: `${LOCAL_BASE}/oauth/callback` };
}

const withoutAuthorization = (headers: Record<string, string>) =>
  Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== "authorization"));

export async function connectorsForRun(bot: Bot) {
  const connectors: RunConnector[] = [];
  const env: Record<string, string> = {};
  const unavailable: string[] = [];
  for (const c of db.listConnectors().filter((x) => bot.connectorIds.includes(x.id))) {
    if (c.kind !== "http" || hasStaticAuth(c)) {
      connectors.push(c);
      continue;
    }
    if (needsDetect(c)) await detect(c);
    const token = await bearer(c);
    if (token) {
      const tokenEnv = `FABS_MCP_TOKEN_${Object.keys(env).length + 1}`;
      env[tokenEnv] = token;
      connectors.push({ ...c, headers: withoutAuthorization(c.headers), tokenEnv });
    } else if (!needsToken(c)) connectors.push(c);
    else unavailable.push(`${c.name} (${access(c).auth === "error" ? "can't sign in" : "needs sign-in"})`);
  }
  return { connectors, env, unavailable };
}

const scrub = (text: string, secrets: string[]) => secrets.reduce((t, s) => t.split(s).join("…"), text);

async function checkBot(bot: Bot, list: Connector[], retry = true): Promise<void> {
  const refused: Connector[] = [];
  try {
    const plugins = await connectorsForRun({ ...bot, connectorIds: list.map((c) => c.id) });
    const reachable = plugins.connectors.filter((c) => c.kind === "http");
    if (!reachable.length) return;
    const launch = launchFor(bot.provider);
    const label = providers[bot.provider].label;
    let results: Record<string, CheckResult> = {};
    let failure = "";
    try {
      mkdirSync(bot.cwd, { recursive: true });
      results = await providers[bot.provider].checkConnectors!({
        bot,
        launch: { ...launch, env: { ...launch.env, ...plugins.env } },
        cwd: bot.cwd,
        connectors: reachable,
        signal: AbortSignal.timeout(CHECK_MS),
      });
    } catch (e) {
      failure = (e as Error).message;
    }
    const secrets = Object.values(plugins.env);
    for (const c of reachable) {
      const r = results[c.id] ?? { state: "failed", tools: [], detail: failure || `${label} didn't report ${c.name} in time.` };
      try {
        db.saveCheck({ botId: bot.id, connectorId: c.id, state: r.state, tools: r.tools, detail: scrub(r.detail, secrets) });
      } catch {}
      if (retry && c.tokenEnv && r.state === "auth") refused.push(c);
    }
  } catch (e) {
    console.error("plugin check failed:", (e as Error).message);
  } finally {
    for (const c of list) checking.delete(pair(bot.id, c.id));
    publish({ type: "connectors" });
  }
  const renewed: Connector[] = [];
  for (const c of refused) if (await renew(c)) renewed.push(c);
  if (renewed.length) await checkBot(bot, renewed, false);
}

export function checkBots(botIds: string[], connectorId?: string): Promise<void> {
  const jobs: [Bot, Connector[]][] = [];
  for (const id of botIds) {
    const bot = db.getBot(id);
    if (!bot || !providers[bot.provider].checkConnectors) continue;
    const list = db.listConnectors().filter((c) => c.kind === "http" && bot.connectorIds.includes(c.id) && (!connectorId || c.id === connectorId));
    if (!list.length) continue;
    for (const c of list) checking.add(pair(bot.id, c.id));
    jobs.push([bot, list]);
  }
  if (!jobs.length) return Promise.resolve();
  publish({ type: "connectors" });
  const run = queue.then(async () => {
    for (const [bot, list] of jobs) await checkBot(bot, list);
  });
  queue = run.catch(() => {});
  return run;
}

export async function checkConnector(c: Connector, botId?: string) {
  await detect(c);
  publish({ type: "connectors" });
  await checkBots(botId ? [botId] : usersOf(c.id), c.id);
}

export async function connectorSaved(c: Connector) {
  db.clearChecks({ connectorId: c.id });
  await checkConnector(c);
}

export function botSaved(before: Bot, after: Bot) {
  const sameIds = before.connectorIds.length === after.connectorIds.length && before.connectorIds.every((id) => after.connectorIds.includes(id));
  if (before.provider === after.provider && sameIds) return;
  db.clearChecks({ botId: after.id });
  publish({ type: "connectors" });
  void checkBots([after.id]);
}

export const finishConnectorSignIn = (query: URLSearchParams) => finishSignIn(query, findConnector);
