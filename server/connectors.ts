import type { Bot, Connector, ConnectorStatus } from "../shared/types";
import { publish } from "./bus";
import * as db from "./db";
import { access, bearer, detect, finishSignIn, hasStaticAuth, needsDetect, onAuthChange } from "./oauth";
import type { RunConnector } from "./providers/types";

export const findConnector = (id: string) => db.listConnectors().find((c) => c.id === id) ?? null;

const detecting = new Set<string>();

onAuthChange(() => publish({ type: "connectors" }));

function detectLater(c: Connector) {
  if (detecting.has(c.id)) return;
  detecting.add(c.id);
  void detect(c).finally(() => {
    detecting.delete(c.id);
    publish({ type: "connectors" });
  });
}

export function connectorStatus(): ConnectorStatus {
  const connectors = db.listConnectors();
  for (const c of connectors) if (needsDetect(c)) detectLater(c);
  return { access: connectors.map(access), checks: [] };
}

export async function connectorSaved(c: Connector) {
  await detect(c);
  publish({ type: "connectors" });
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
    const { auth } = access(c);
    if (token) {
      const tokenEnv = `FABS_MCP_TOKEN_${Object.keys(env).length + 1}`;
      env[tokenEnv] = token;
      connectors.push({ ...c, headers: withoutAuthorization(c.headers), tokenEnv });
    } else if (auth === "none") connectors.push(c);
    else unavailable.push(`${c.name} (${auth === "error" || auth === "unknown" ? "can't connect" : "needs sign-in"})`);
  }
  return { connectors, env, unavailable };
}

export const finishConnectorSignIn = (query: URLSearchParams) => finishSignIn(query, findConnector);
