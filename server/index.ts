import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { hostname } from "node:os";
import { basename, join, relative } from "node:path";
import type { Server, ServerWebSocket } from "bun";
import type { Bot, HostInfo, MessagePart, ServerEvent } from "../shared/types";
import { BOT_TEMPLATES, CONNECTOR_PRESETS } from "../shared/templates";
import { FILES_DIR, PORT, SERVE_TARGET_PORT, SHARED_DIR, TAILSCALE_SERVE_PORT, WEB_DIST, WORK_ROOT } from "./config";
import * as db from "./db";
import { ACCESS_TOKEN, authorized, isLoopback, pairCookie, sameOrigin, timingSafeEqual } from "./auth";
import { getLinks, getStatuses, publish, subscribe } from "./bus";
import { handleMcp, decideApproval } from "./mcp";
import { within } from "./paths";
import { directThread, editMessageParts, greet, postUserMessage, stopTurns } from "./orchestrator";
import { providerInfo } from "./providers";
import { scanClaudeInventory } from "./providers/claude";
import { fireRoutine, reschedule, withNextRun } from "./scheduler";
import { disableServe, enableServe, killRunningCommands, tailscaleState, type ServeProblem } from "./tailscale";

db.closeDanglingMessages();
reschedule();

let ownerLogin: string | null = null;
async function refreshTailscale() {
  const ts = await tailscaleState(SERVE_TARGET_PORT);
  ownerLogin = ts.login;
  return ts;
}

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
  Promise.race([off, Bun.sleep(5_000)]).finally(() => {
    killRunningCommands();
    process.exit(0);
  });
}

const json = (data: unknown, status = 200) => Response.json(data, { status });
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
  };
}

function createBot(input: Partial<Bot>): Bot {
  const bot = db.saveBot(sanitizeBot(input));
  mkdirSync(bot.cwd, { recursive: true });
  publish({ type: "bot", bot });
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
  const base = ts.serveUrl ?? (ts.dnsName ? `http://${ts.dnsName}:${PORT}` : ts.ip ? `http://${ts.ip}:${PORT}` : null);
  return {
    hostname: hostname(),
    port: PORT,
    tailscale: ts,
    serve: { enabled: serveEnabled(), port: TAILSCALE_SERVE_PORT, problem: serveProblem },
    pairUrl: base ? `${base}/pair?token=${ACCESS_TOKEN}` : null,
    workRoot: WORK_ROOT,
  };
}

type Handler = (req: Request, params: Record<string, string>, url: URL) => Response | Promise<Response>;
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
route("GET", "/api/providers", (_r, _p, url) => providerInfo(url.searchParams.has("refresh")).then(json));

route("GET", "/api/bots", () => json(db.listBots()));
route("POST", "/api/bots", async (req) => json(createBot(await body(req))));
route("PUT", "/api/bots/:id", async (req, p) => {
  const existing = db.getBot(p.id!);
  if (!existing) return bad("not found", 404);
  const next = sanitizeBot(await body(req), existing);
  if (next.provider !== existing.provider || next.cwd !== existing.cwd) db.resetSessionsForBot(existing.id);
  const bot = db.saveBot({ ...next, createdAt: existing.createdAt });
  mkdirSync(bot.cwd, { recursive: true });
  publish({ type: "bot", bot });
  return json(bot);
});
route("DELETE", "/api/bots/:id", (_r, p) => {
  db.deleteBot(p.id!);
  publish({ type: "bot.deleted", botId: p.id! });
  reschedule();
  return json({ ok: true });
});
route("POST", "/api/bots/:id/reset", (_r, p) => {
  db.resetSessionsForBot(p.id!);
  return json({ ok: true });
});
route("POST", "/api/bots/:id/direct", (_r, p) => json(directThread(p.id!)));
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
  const full = bot && within(bot.cwd, url.searchParams.get("path") ?? "");
  if (!full || !existsSync(full) || !statSync(full).isFile()) return bad("not found", 404);
  return new Response(Bun.file(full), { headers: { "Content-Disposition": `inline; filename="${encodeURIComponent(basename(full))}"` } });
});

route("GET", "/api/threads", () => json(db.listThreads()));
route("POST", "/api/threads", async (req) => {
  const b = await body<{ botIds: string[]; text?: string; title?: string; fileIds?: string[] }>(req);
  const ids = (b.botIds ?? []).filter((id) => db.getBot(id));
  if (!ids.length) return bad("pick at least one bot");
  const thread = db.createThread(ids.length > 1 ? "group" : "direct", ids, b.title ?? "");
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
  db.deleteThread(p.id!);
  publish({ type: "thread.deleted", threadId: p.id! });
  return json({ ok: true });
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
  if (!db.getBot(botId) || !db.getThread(p.id!)) return bad("not found", 404);
  db.addMember(p.id!, botId);
  const t = db.getThread(p.id!)!;
  publish({ type: "thread", thread: t });
  return json(t);
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
  return json(c);
});
route("DELETE", "/api/connectors/:id", (_r, p) => {
  db.deleteConnector(p.id!);
  return json({ ok: true });
});
route("GET", "/api/connectors/inherited", async (_r, _p, url) => {
  const cached = db.getSetting("claude.inherited");
  if (cached && !url.searchParams.has("refresh")) return json(JSON.parse(cached));
  const servers = await scanClaudeInventory(SHARED_DIR).catch(() => []);
  const value = { scannedAt: Date.now(), servers };
  db.setSetting("claude.inherited", JSON.stringify(value));
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

type WsData = { unsubscribe?: () => void };

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

  if (url.pathname === "/pair") {
    if (!timingSafeEqual(url.searchParams.get("token") ?? "", ACCESS_TOKEN)) return new Response("Invalid pairing link", { status: 403 });
    return new Response(null, { status: 302, headers: { Location: "/", "Set-Cookie": pairCookie() } });
  }

  const isApi = url.pathname.startsWith("/api/") || url.pathname.startsWith("/files/") || url.pathname === "/ws";
  if (isApi && !authorized(req, ip, ownerLogin, viaServe)) return json({ error: "unpaired" }, 401);
  if (isApi && !sameOrigin(req)) return bad("cross-origin request refused", 403);

  if (url.pathname === "/ws") {
    return server.upgrade(req, { data: {} }) ? undefined : new Response("expected websocket", { status: 400 });
  }

  if (url.pathname.startsWith("/files/")) {
    const f = db.getFile(url.pathname.slice(7));
    if (!f || !existsSync(f.path)) return new Response("not found", { status: 404 });
    const disposition = url.searchParams.has("download") ? "attachment" : "inline";
    return new Response(Bun.file(f.path), {
      headers: { "Content-Disposition": `${disposition}; filename="${encodeURIComponent(f.name)}"` },
    });
  }

  if (isApi) {
    for (const [method, re, keys, h] of routes) {
      if (method !== req.method) continue;
      const m = url.pathname.match(re);
      if (!m) continue;
      const params = Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
      try {
        return await h(req, params, url);
      } catch (e) {
        if (e instanceof HttpError) return bad(e.message, e.status);
        console.error(e);
        return bad((e as Error).message, 500);
      }
    }
    return bad("not found", 404);
  }

  return serveStatic(url);
}

const websocket = {
  open(ws: ServerWebSocket<WsData>) {
    const hello: ServerEvent = {
      type: "hello",
      bots: db.listBots(),
      statuses: getStatuses(),
      threads: db.listThreads(),
      links: getLinks(),
    };
    ws.send(JSON.stringify(hello));
    ws.data.unsubscribe = subscribe((e) => ws.send(JSON.stringify(e)));
  },
  message() {},
  close(ws: ServerWebSocket<WsData>) {
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
console.log("fabs-bot");
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
