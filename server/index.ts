import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { hostname } from "node:os";
import { basename, join, relative } from "node:path";
import type { Server, ServerWebSocket } from "bun";
import { ENV_NAME, type Bot, type HostInfo, type MessagePart, type PairingLink, type ProviderSettings, type ServerEvent } from "../shared/types";
import { BOT_TEMPLATES, CONNECTOR_PRESETS } from "../shared/templates";
import { FILES_DIR, LOCAL_BASE, PORT, SERVE_TARGET_PORT, SHARED_DIR, TAILSCALE_SERVE_PORT, VERSION, WEB_DIST, WORK_ROOT } from "./config";
import * as db from "./db";
import { authorized, deviceId, isLoopback, listDevices, localOwner, ownerOnly, newPairingCode, pairCookie, pairDevice, redeemPairingCode, removeDevice, sameOrigin } from "./auth";
import { connectorSaved, connectorStatus, findConnector, finishConnectorSignIn } from "./connectors";
import { getLinks, getStatuses, publish, subscribe } from "./bus";
import { handleMcp, decideApproval } from "./mcp";
import { SignInError, configureClient, forget, signOut, startSignIn, usesConfiguredClient } from "./oauth";
import { realPathWithin, within } from "./paths";
import { bringInBot, directThread, editMessageParts, greet, postUserMessage, stopTurns } from "./orchestrator";
import { isProviderId, launchFor, providerInfo, providerSettings, updateProvider } from "./providers";
import { scanClaudeInventory } from "./providers/claude";
import { scanCodexInventory } from "./providers/codex";
import { isLimitsProviderId, providerLimits } from "./providers/limits";
import { fireRoutine, reschedule, withNextRun } from "./scheduler";
import { closeAllScreens, findChromium, forgetScreen, listScreens, releaseScreen, unwatchScreen, viewerMessage, watchScreen, type Viewer } from "./screen";
import { disableServe, enableServe, killRunningCommands, tailscaleState, type ServeProblem } from "./tailscale";

db.closeDanglingMessages();
db.pruneEvents();
reschedule();

const refreshTailscale = () => tailscaleState(SERVE_TARGET_PORT);

let serveProblem: ServeProblem | null = null;
let serveListener: Server<WsData> | null = null;
let serveQueue: Promise<void> = Promise.resolve();
const serveEnabled = () => db.getSetting("tailscale.serve") === "1";

function listenForServe(): boolean {
  try {
    serveListener ??= Bun.serve<WsData>({
      hostname: "127.0.0.1",
      port: SERVE_TARGET_PORT,
      fetch: (req, server) => fetchHandler(req, server, true),
      websocket,
      idleTimeout: 255,
    });
    return true;
  } catch (e) {
    console.warn(`  could not bind 127.0.0.1:${SERVE_TARGET_PORT} for Tailscale HTTPS`, (e as Error).message);
    return false;
  }
}

/** Bring `tailscale serve` in line with the saved setting. One change at a time. */
function applyServe(): Promise<void> {
  serveQueue = serveQueue.then(async () => {
    if (!serveEnabled()) serveProblem = await disableServe(SERVE_TARGET_PORT, TAILSCALE_SERVE_PORT);
    else serveProblem = listenForServe() ? await enableServe(SERVE_TARGET_PORT, TAILSCALE_SERVE_PORT) : "target-busy";
    await refreshTailscale();
  });
  return serveQueue;
}

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const off = serveQueue.then(() => (serveEnabled() ? disableServe(SERVE_TARGET_PORT, TAILSCALE_SERVE_PORT) : null));
  Promise.race([Promise.all([off, closeAllScreens()]), Bun.sleep(5_000)]).finally(() => {
    killRunningCommands();
    process.exit(0);
  });
}

const json = (data: unknown, status = 200) => Response.json(data, { status });
const API: db.EventOrigin = { actor: "api" };
const bad = (message: string, status = 400) => json({ error: message }, status);

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function body<T = any>(req: Request): Promise<T> {
  if (!req.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "expected application/json");
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

function fileHeaders(name: string, download: boolean): Record<string, string> {
  const type = Bun.file(name.toLowerCase()).type;
  const headers: Record<string, string> = {
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(name)}"`,
    "X-Content-Type-Options": "nosniff",
  };
  if (download) headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
  else if (type.startsWith("image/svg")) headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  else if (/html|xml/.test(type)) headers["Content-Security-Policy"] = "sandbox allow-scripts allow-forms allow-popups allow-downloads";
  return headers;
}

function sanitizeBot(input: Partial<Bot>, existing?: Bot): Omit<Bot, "createdAt"> {
  const name = String(input.name ?? existing?.name ?? "").trim() || "New Bot";
  return {
    id: existing?.id ?? db.newId(),
    name,
    label: String(input.label ?? existing?.label ?? "").trim(),
    role: String(input.role ?? existing?.role ?? ""),
    instructions: String(input.instructions ?? existing?.instructions ?? ""),
    shape: (input.shape ?? existing?.shape ?? "blob") as Bot["shape"],
    color: String(input.color ?? existing?.color ?? "#111111"),
    provider: (input.provider ?? existing?.provider ?? "claude") as Bot["provider"],
    model: String(input.model ?? existing?.model ?? ""),
    cwd: String(input.cwd || existing?.cwd || join(WORK_ROOT, db.slug(name) || "bot")),
    autonomy: input.autonomy === "ask" || input.autonomy === "full" ? input.autonomy : (existing?.autonomy ?? "full"),
    connectorIds: Array.isArray(input.connectorIds) ? input.connectorIds.map(String) : (existing?.connectorIds ?? []),
    isTeamLead: typeof input.isTeamLead === "boolean" ? input.isTeamLead : (existing?.isTeamLead ?? false),
  };
}

function saveAndPublish(next: Omit<Bot, "createdAt"> & { createdAt?: number }): Bot {
  const formerLead = db.teamLead();
  const bot = db.saveBot(next);
  mkdirSync(bot.cwd, { recursive: true });
  publish({ type: "bot", bot });
  const cleared = formerLead && formerLead.id !== bot.id && bot.isTeamLead ? db.getBot(formerLead.id) : null;
  if (cleared) publish({ type: "bot", bot: cleared });
  return bot;
}

function createBot(input: Partial<Bot>): Bot {
  const draft = sanitizeBot(input);
  const bot = saveAndPublish({ ...draft, model: draft.model || providerSettings(draft.provider).defaultModel });
  greet(bot);
  return bot;
}

/** A fresh install starts with one bot already waiting in its chat. */
function onboard() {
  if (db.getSetting("onboarded")) return;
  if (db.listBots().length === 0) createBot(BOT_TEMPLATES.find((t) => t.key === "chief")!);
  db.setSetting("onboarded", "1");
}

async function hostInfo(): Promise<HostInfo> {
  const ts = await refreshTailscale();
  return {
    hostname: hostname(),
    version: VERSION,
    port: PORT,
    tailscale: ts,
    serve: { enabled: serveEnabled(), port: TAILSCALE_SERVE_PORT, problem: serveProblem },
    workRoot: WORK_ROOT,
  };
}

async function pairingLink(): Promise<PairingLink | null> {
  const ts = await refreshTailscale();
  const base = ts.serveUrl ?? (ts.dnsName ? `http://${ts.dnsName}:${PORT}` : ts.ip ? `http://${ts.ip}:${PORT}` : null);
  if (!base) return null;
  const { code, expiresAt } = newPairingCode();
  return { url: `${base}/pair?code=${code}`, expiresAt };
}

type From = { ip: string | undefined; viaServe: boolean };
type Handler = (req: Request, params: Record<string, string>, url: URL, from: From) => Response | Promise<Response>;
const routes: [string, RegExp, string[], Handler][] = [];
function route(method: string, path: string, h: Handler) {
  const keys: string[] = [];
  const re = new RegExp("^" + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$");
  routes.push([method, re, keys, h]);
}

route("GET", "/api/host", () => hostInfo().then(json));
route("PUT", "/api/host/serve", async (req) => {
  const { enabled } = await body<{ enabled: boolean }>(req);
  db.setSetting("tailscale.serve", enabled ? "1" : "0");
  await applyServe();
  if (serveProblem) db.setSetting("tailscale.serve", enabled ? "0" : "1");
  return json(await hostInfo());
});
route("POST", "/api/pairing-links", async () => {
  const link = await pairingLink();
  return link ? json(link) : bad("Start Tailscale on this PC to pair a device.", 409);
});
route("GET", "/api/devices", (req) => json(listDevices(req)));
route("DELETE", "/api/devices/:id", (_r, p) => {
  if (!removeDevice(p.id!)) return bad("not found", 404);
  for (const ws of sockets) if (ws.data.deviceId === p.id) ws.close(1008, "device removed");
  publish({ type: "devices" });
  return json({ ok: true });
});
route("GET", "/api/providers", (_r, _p, url) => providerInfo(url.searchParams.has("refresh")).then(json));
route("GET", "/api/providers/:id/limits", (_r, p, url) => {
  const id = p.id!;
  if (!isLimitsProviderId(id)) return bad("not found", 404);
  return providerLimits(id, url.searchParams.has("refresh")).then(json);
});
route("PUT", "/api/providers/:id", async (req, p) => {
  const id = p.id!;
  if (!isProviderId(id)) return bad("not found", 404);
  const patch = await body<Partial<ProviderSettings>>(req);
  const badName = Object.keys(patch.env ?? {}).find((name) => !ENV_NAME.test(name));
  if (badName) return bad(`"${badName}" isn't a valid variable name. Use letters, digits and _, and don't start with a digit.`);
  return json(await updateProvider(id, patch));
});

route("GET", "/api/bots", () => json(db.listBots()));
route("POST", "/api/bots", async (req) => json(createBot(await body(req))));
route("PUT", "/api/bots/:id", async (req, p) => {
  const existing = db.getBot(p.id!);
  if (!existing) return bad("not found", 404);
  const next = sanitizeBot(await body(req), existing);
  if (next.provider !== existing.provider || next.cwd !== existing.cwd) db.resetSessionsForBot(existing.id);
  const bot = saveAndPublish({ ...next, createdAt: existing.createdAt });
  return json(bot);
});
route("DELETE", "/api/bots/:id", async (_r, p) => {
  await forgetScreen(p.id!);
  db.deleteBot(p.id!);
  publish({ type: "bot.deleted", botId: p.id! });
  reschedule();
  return json({ ok: true });
});
route("POST", "/api/bots/:id/reset", (_r, p) => {
  db.resetSessionsForBot(p.id!);
  return json({ ok: true });
});
route("POST", "/api/bots/:id/direct", (_r, p) => json(directThread(p.id!, API)));
route("GET", "/api/bots/:id/files", (_r, p, url) => {
  const bot = db.getBot(p.id!);
  if (!bot) return bad("not found", 404);
  mkdirSync(bot.cwd, { recursive: true });
  const dir = within(bot.cwd, url.searchParams.get("path") ?? "");
  if (!dir || !existsSync(dir)) return bad("no such folder", 404);
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith(".") || e.name === ".claude")
    .filter((e) => within(bot.cwd, join(dir, e.name)))
    .map((e) => {
      const full = join(dir, e.name);
      let size = 0;
      let mtime = 0;
      try {
        const s = statSync(full);
        size = s.size;
        mtime = s.mtimeMs;
      } catch {}
      return { name: e.name, dir: e.isDirectory(), size, mtime, path: relative(bot.cwd, full) };
    })
    .sort((a, b) => Number(b.dir) - Number(a.dir) || b.mtime - a.mtime);
  return json({ root: bot.cwd, path: relative(bot.cwd, dir), entries });
});
route("GET", "/api/bots/:id/file", (_r, p, url) => {
  const bot = db.getBot(p.id!);
  const path = url.searchParams.get("path") ?? "";
  const real = bot && realPathWithin(bot.cwd, path);
  if (!real || !existsSync(real) || !statSync(real).isFile()) return bad("not found", 404);
  return new Response(Bun.file(real, { type: Bun.file(basename(path).toLowerCase()).type }), {
    headers: fileHeaders(basename(path), url.searchParams.has("download")),
  });
});

route("GET", "/api/threads", () => json(db.listThreads()));
route("POST", "/api/threads", async (req) => {
  const b = await body<{ botIds: string[]; text?: string; title?: string; fileIds?: string[] }>(req);
  const ids = (b.botIds ?? []).filter((id) => db.getBot(id));
  if (!ids.length) return bad("pick at least one bot");
  const thread = db.createThread(ids.length > 1 ? "group" : "direct", ids, b.title ?? "", API);
  publish({ type: "thread", thread });
  const parts = messageParts(b.text, b.fileIds);
  if (parts.length) await postUserMessage(thread.id, parts);
  return json(db.getThread(thread.id));
});
route("PATCH", "/api/threads/:id", async (req, p) => {
  const b = await body(req);
  const t = db.updateThread(p.id!, {
    ...(b.title !== undefined && { title: String(b.title) }),
    ...(b.topic !== undefined && { topic: String(b.topic) }),
  });
  if (!t) return bad("not found", 404);
  publish({ type: "thread", thread: t });
  return json(t);
});
route("DELETE", "/api/threads/:id", (_r, p) => {
  stopTurns(p.id!);
  db.deleteThread(p.id!, API);
  publish({ type: "thread.deleted", threadId: p.id! });
  return json({ ok: true });
});
route("GET", "/api/threads/:id/events", (_r, p, url) => {
  const after = Number(url.searchParams.get("after") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? 200);
  if (!Number.isInteger(after) || !Number.isInteger(limit)) return bad("after and limit must be whole numbers");
  return json(db.listEvents(p.id!, after, limit));
});
route("GET", "/api/threads/:id/messages", (_r, p) => json(db.listMessages(p.id!)));
route("POST", "/api/threads/:id/messages", async (req, p) => {
  const b = await body<{ text?: string; fileIds?: string[] }>(req);
  const parts = messageParts(b.text, b.fileIds);
  if (!parts.length) return bad("empty message");
  return json(await postUserMessage(p.id!, parts));
});
route("POST", "/api/threads/:id/read", (_r, p) => {
  const t = db.updateThread(p.id!, { unread: 0 });
  if (t) publish({ type: "thread", thread: t });
  return json({ ok: true });
});
route("POST", "/api/threads/:id/stop", (_r, p) => {
  stopTurns(p.id!);
  return json({ ok: true });
});
route("POST", "/api/threads/:id/members", async (req, p) => {
  const { botId } = await body(req);
  const thread = bringInBot(p.id!, String(botId), API);
  return thread ? json(thread) : bad("not found", 404);
});

route("POST", "/api/messages/:id/answer", async (req, p) => {
  const { partIndex, option } = await body<{ partIndex: number; option: number }>(req);
  const m = db.getMessage(p.id!);
  const part = m?.parts[partIndex];
  if (!m || part?.type !== "question" || part.answered !== undefined) return bad("can't answer that");
  editMessageParts(m.id, (parts) => {
    const live = parts[partIndex];
    if (live?.type === "question") live.answered = option;
  });
  const letter = String.fromCharCode(65 + option);
  await postUserMessage(m.threadId, [{ type: "text", text: `${letter}. ${part.options[option]}` }]);
  return json({ ok: true });
});
route("POST", "/api/messages/:id/screen", async (req, p) => {
  const { partIndex, outcome } = await body<{ partIndex: number; outcome: string }>(req);
  const m = db.getMessage(p.id!);
  const part = m?.parts[partIndex];
  if (!m || part?.type !== "screen" || part.outcome) return bad("that request is already settled", 409);
  const done = outcome !== "skipped";
  editMessageParts(m.id, (parts) => {
    const live = parts[partIndex];
    if (live?.type === "screen") live.outcome = done ? "done" : "skipped";
  });
  releaseScreen(part.botId);
  const text = done ? "I'm done on your screen. It's yours again, carry on." : "Skip that step on your screen and carry on without it.";
  await postUserMessage(m.threadId, [{ type: "text", text }]);
  return json({ ok: true });
});
route("POST", "/api/approvals/:id", async (req, p) => {
  const { decision } = await body(req);
  return decideApproval(p.id!, decision === "allow" ? "allow" : "deny") ? json({ ok: true }) : bad("already decided", 409);
});

route("POST", "/api/upload", async (req) => {
  const form = await req.formData();
  const out = [];
  const dir = join(SHARED_DIR, "uploads");
  mkdirSync(dir, { recursive: true });
  for (const value of form.getAll("file")) {
    if (!(value instanceof File)) continue;
    const name = basename(value.name) || "upload";
    const dest = join(dir, `${Date.now().toString(36)}-${name}`);
    await Bun.write(dest, value);
    const f = db.addFile({ thread_id: null, bot_id: null, path: dest, name, size: value.size });
    out.push({ fileId: f.id, name, size: value.size });
  }
  return json(out);
});

route("GET", "/api/routines", () => json(db.listRoutines().map(withNextRun)));
route("POST", "/api/routines", async (req) => {
  const b = await body(req);
  if (!db.getBot(b.botId)) return bad("unknown bot");
  const r = db.saveRoutine({
    id: b.id ?? db.newId(),
    botId: b.botId,
    name: String(b.name ?? "Routine"),
    cron: String(b.cron ?? ""),
    prompt: String(b.prompt ?? ""),
    threadId: b.threadId ?? null,
    enabled: b.enabled !== false,
  });
  reschedule();
  return json(withNextRun(r));
});
route("DELETE", "/api/routines/:id", (_r, p) => {
  db.deleteRoutine(p.id!);
  reschedule();
  return json({ ok: true });
});
route("POST", "/api/routines/:id/run", (_r, p) => {
  void fireRoutine(p.id!);
  return json({ ok: true });
});

route("GET", "/api/connectors", () => json(db.listConnectors()));
route("GET", "/api/connectors/presets", () => json(CONNECTOR_PRESETS));
route("GET", "/api/connectors/status", () => json(connectorStatus()));
route("POST", "/api/connectors", async (req) => {
  const b = await body(req);
  const c = db.saveConnector({
    id: b.id ?? db.newId(),
    name: String(b.name ?? "Connector"),
    preset: String(b.preset ?? "custom"),
    kind: b.kind === "http" ? "http" : "stdio",
    command: String(b.command ?? ""),
    args: Array.isArray(b.args) ? b.args.map(String) : [],
    env: b.env ?? {},
    url: String(b.url ?? ""),
    headers: b.headers ?? {},
  });
  if (typeof b.oauthClientId === "string") configureClient(c, b.oauthClientId, typeof b.oauthClientSecret === "string" ? b.oauthClientSecret : undefined);
  void connectorSaved(c);
  return json(c);
});
route("DELETE", "/api/connectors/:id", async (_r, p) => {
  const c = findConnector(p.id!);
  if (c) await forget(c);
  db.deleteConnector(p.id!);
  publish({ type: "connectors" });
  return json({ ok: true });
});
route("POST", "/api/connectors/:id/sign-in", async (req, p, _u, from) => {
  const c = findConnector(p.id!);
  if (!c) return bad("not found", 404);
  const serveUrl = from.viaServe && !usesConfiguredClient(c) ? (await refreshTailscale()).serveUrl : null;
  const url = await startSignIn(c, `${serveUrl ?? LOCAL_BASE}/oauth/callback`).finally(() => publish({ type: "connectors" }));
  return json({ url, pasteBack: !serveUrl && !localOwner(req, from.ip, from.viaServe) });
});
route("POST", "/api/connectors/:id/sign-in/finish", async (req) => {
  const { address } = await body<{ address?: string }>(req);
  let query: URLSearchParams;
  try {
    query = new URL(String(address ?? "").trim()).searchParams;
  } catch {
    return bad("That isn't the address from the sign-in page. Copy the whole address from the browser's address bar.");
  }
  if (!query.get("state")) return bad("That address has no sign-in code. Copy the address of the page you landed on after approving.");
  await finishConnectorSignIn(query);
  return json({ ok: true });
});
route("DELETE", "/api/connectors/:id/sign-in", async (_r, p) => {
  const c = findConnector(p.id!);
  if (!c) return bad("not found", 404);
  return json({ confirmed: await signOut(c) });
});
route("GET", "/api/connectors/inherited", async (_r, _p, url) => {
  const cached = db.getSetting("plugins.inherited");
  if (cached && !url.searchParams.has("refresh")) return json(JSON.parse(cached));
  const scans = await Promise.all([
    scanClaudeInventory(SHARED_DIR, launchFor("claude")).catch(() => []),
    scanCodexInventory(SHARED_DIR, launchFor("codex")).catch(() => []),
  ]);
  const value = { scannedAt: Date.now(), servers: scans.flat() };
  db.setSetting("plugins.inherited", JSON.stringify(value));
  return json(value);
});

function messageParts(text?: string, fileIds?: string[]): MessagePart[] {
  const parts: MessagePart[] = [];
  for (const id of fileIds ?? []) {
    const f = db.getFile(id);
    if (f) parts.push({ type: "file", fileId: f.id, name: f.name, size: f.size });
  }
  if (text?.trim()) parts.push({ type: "text", text: text.trim() });
  return parts;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

async function oauthCallback(url: URL): Promise<Response> {
  let title = "Sign-in didn't finish";
  let text = "Something went wrong. Go back to Fabs Bot and try again.";
  try {
    const c = await finishConnectorSignIn(url.searchParams);
    title = `Signed in to ${c.name}`;
    text = "You can close this tab and go back to Fabs Bot.";
  } catch (e) {
    if (e instanceof SignInError) text = e.message;
    else console.error("sign-in callback failed", (e as Error).message);
  }
  const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;line-height:1.5"><h1 style="font-size:1.4rem">${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p></body>`;
  return new Response(page, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}

type WsData = { deviceId: string | null; unsubscribe?: () => void; screenBotId?: string; viewer?: Viewer };
const sockets = new Set<ServerWebSocket<WsData>>();

function serveStatic(url: URL): Response {
  if (!existsSync(WEB_DIST)) {
    return new Response("Web app not built yet. Run `bun run build` (or `bun run dev` and open :5173).", { status: 503 });
  }
  const p = within(WEB_DIST, decodeURIComponent(url.pathname.slice(1)));
  if (p && existsSync(p) && statSync(p).isFile()) {
    const cache = url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    return new Response(Bun.file(p), { headers: { "Cache-Control": cache } });
  }
  return new Response(Bun.file(join(WEB_DIST, "index.html")), { headers: { "Cache-Control": "no-cache" } });
}

async function fetchHandler(req: Request, server: Server<WsData>, viaServe = false): Promise<Response | undefined> {
  const url = new URL(req.url);
  const ip = server.requestIP(req)?.address;

  // Agents on this PC call back into the app; never exposed beyond loopback.
  if (url.pathname.startsWith("/mcp/")) {
    if (viaServe || !isLoopback(ip) || req.headers.get("tailscale-user-login")) return new Response("forbidden", { status: 403 });
    return handleMcp(req, url.pathname.slice(5));
  }

  if (url.pathname === "/oauth/callback") return oauthCallback(url);

  if (url.pathname === "/pair") {
    if (!redeemPairingCode(url.searchParams.get("code") ?? ""))
      return new Response("This pairing link expired or was already used. On your PC, open This PC and choose Pair a device to get a new one.", { status: 403 });
    const token = pairDevice(req.headers.get("user-agent") ?? "");
    publish({ type: "devices" });
    return new Response(null, { status: 302, headers: { Location: "/", "Set-Cookie": pairCookie(token) } });
  }

  const isApi = url.pathname.startsWith("/api/") || url.pathname.startsWith("/files/") || url.pathname === "/ws" || url.pathname === "/screen";
  if (isApi && !authorized(req, ip, viaServe)) return json({ error: "unpaired" }, 401);
  if (isApi && !sameOrigin(req)) return bad("cross-origin request refused", 403);
  if (/^\/api\/threads\/[^/]+\/events$/.test(url.pathname) && !ownerOnly(req, ip, viaServe)) return bad("only available on this PC", 403);

  if (url.pathname === "/ws") {
    return server.upgrade(req, { data: { deviceId: deviceId(req) } }) ? undefined : new Response("expected websocket", { status: 400 });
  }

  if (url.pathname === "/screen") {
    const bot = db.getBot(url.searchParams.get("bot") ?? "");
    if (!bot) return bad("not found", 404);
    return server.upgrade(req, { data: { deviceId: deviceId(req), screenBotId: bot.id } }) ? undefined : new Response("expected websocket", { status: 400 });
  }

  if (url.pathname.startsWith("/files/")) {
    const f = db.getFile(url.pathname.slice(7));
    if (!f || !existsSync(f.path)) return new Response("not found", { status: 404 });
    return new Response(Bun.file(f.path, { type: Bun.file(f.name.toLowerCase()).type }), {
      headers: fileHeaders(f.name, url.searchParams.has("download")),
    });
  }

  if (isApi) {
    for (const [method, re, keys, h] of routes) {
      if (method !== req.method) continue;
      const m = url.pathname.match(re);
      if (!m) continue;
      const params = Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
      try {
        return await h(req, params, url, { ip, viaServe });
      } catch (e) {
        if (e instanceof HttpError) return bad(e.message, e.status);
        if (e instanceof SignInError) return bad(e.message, 409);
        console.error(e);
        return bad((e as Error).message, 500);
      }
    }
    return bad("not found", 404);
  }

  return serveStatic(url);
}

const HEARTBEAT_MS = 15_000;
const heartbeat: ServerEvent = { type: "heartbeat", everyMs: HEARTBEAT_MS };

const websocket = {
  open(ws: ServerWebSocket<WsData>) {
    sockets.add(ws);
    if (ws.data.screenBotId) {
      ws.data.viewer = { botId: ws.data.screenBotId, send: (data) => void ws.send(data), ready: true, pending: null };
      watchScreen(ws.data.viewer);
      return;
    }
    const hello: ServerEvent = {
      type: "hello",
      bots: db.listBots(),
      statuses: getStatuses(),
      threads: db.listThreads(),
      links: getLinks(),
      screens: listScreens(),
      chromium: !!findChromium(),
    };
    ws.send(JSON.stringify(hello));
    ws.send(JSON.stringify(heartbeat));
    ws.data.unsubscribe = subscribe((e) => ws.send(JSON.stringify(e)));
  },
  message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
    if (ws.data.viewer) viewerMessage(ws.data.viewer, String(raw));
  },
  close(ws: ServerWebSocket<WsData>) {
    sockets.delete(ws);
    if (ws.data.viewer) return unwatchScreen(ws.data.viewer);
    ws.data.unsubscribe?.();
  },
};

function listen(hostname: string) {
  const s = Bun.serve<WsData>({ hostname, port: PORT, fetch: fetchHandler, websocket, idleTimeout: 255 });
  console.log(`  ↳ listening on http://${hostname.includes(":") ? `[${hostname}]` : hostname}:${s.port}`);
  return s;
}

onboard();
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => publish(heartbeat), HEARTBEAT_MS);
setInterval(db.pruneEvents, 60 * 60_000);
console.log(`fabs-bot ${VERSION}`);
void providerInfo();
if (serveEnabled()) void applyServe();
if (process.env.FABS_HOST) {
  listen(process.env.FABS_HOST);
} else {
  // Loopback for this PC (and `tailscale serve`), plus the tailnet IP for your other devices. Never the LAN.
  listen("127.0.0.1");
  let tailnetBound = false;
  const bindTailnet = async () => {
    if (tailnetBound) return;
    const ts = await refreshTailscale();
    if (!ts.ip) return;
    try {
      listen(ts.ip);
      tailnetBound = true;
      console.log("  ↳ pair a device from This PC");
    } catch (e) {
      console.warn(`  could not bind ${ts.ip}:${PORT}`, (e as Error).message);
    }
  };
  await bindTailnet();
  setInterval(bindTailnet, 30_000);
}
