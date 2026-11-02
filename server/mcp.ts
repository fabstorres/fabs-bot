/**
 * A minimal MCP server (streamable HTTP, JSON responses) that every bot gets for each turn.
 * The URL token identifies the bot, thread and turn, so tools act in the right place.
 */
import { copyFileSync, existsSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { Cron } from "croner";
import { botsNamed, handleOf, linkHandles, readable } from "../shared/mentions";
import type { Bot, Message, MessagePart, Thread } from "../shared/types";
import { FILES_DIR, VERSION } from "./config";
import * as db from "./db";
import { getStatus, publish, setStatus } from "./bus";
import { bringInBot, directThread, messageBot, turnsByToken, type TurnContext } from "./orchestrator";
import { reschedule } from "./scheduler";
import { clip } from "./providers/spawn";

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: any, ctx: TurnContext): Promise<string> | string;
};

const str = (description: string) => ({ type: "string", description });

const pendingApprovals = new Map<string, { resolve: (d: "allow" | "deny") => void; ctx: TurnContext; index: number }>();

function publishThread(threadId: string) {
  const t = db.getThread(threadId);
  if (t) publish({ type: "thread", thread: t });
}

const isLive = (ctx: TurnContext) => turnsByToken.get(ctx.token) === ctx;

export function decideApproval(requestId: string, decision: "allow" | "deny"): boolean {
  const p = pendingApprovals.get(requestId);
  if (!p) return false;
  pendingApprovals.delete(requestId);
  p.resolve(isLive(p.ctx) ? decision : "deny");
  return true;
}

const PAGE_DEFAULT = 25;
const PAGE_MAX = 50;
const READ_BUDGET = 20_000;
const MESSAGE_CAP = 4_000;
const LABEL_CAP = 200;

function pageLimit(value: unknown): number {
  if (value === undefined || value === null) return PAGE_DEFAULT;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > PAGE_MAX) throw new Error(`limit must be a whole number from 1 to ${PAGE_MAX}.`);
  return n;
}

function threadCursor(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const match = /^(\d+):(.+)$/.exec(String(value));
  if (!match) throw new Error(`Bad cursor "${value}". Pass next_cursor from your last list_threads call, or leave it out.`);
  return { updatedAt: Number(match[1]), id: match[2] };
}

function seqCursor(value: unknown): number {
  if (value === undefined || value === null) return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error("after_seq must be a whole number, 0 or more.");
  return n;
}

const botName = (id: string | null) => db.getBot(id ?? "")?.name ?? "A former teammate";
const isoTime = (ms: number) => new Date(ms).toISOString();
const capLabel = (text: string) => (text.length > LABEL_CAP ? `${text.slice(0, LABEL_CAP)}…` : text);

function describeThread(t: Thread): string {
  const label = [t.title && `"${capLabel(t.title)}"`, t.topic && `topic: ${capLabel(t.topic)}`].filter(Boolean).join(", ") || "untitled";
  const members = t.memberIds.map((id) => capLabel(botName(id))).join(", ") || "none";
  return `${t.id} · ${t.kind} · ${label} · members: ${members} · last activity ${isoTime(t.updatedAt)}`;
}

function describeMessage(m: Message, bots: Bot[]): string {
  const author = m.author === "user" ? "User" : m.author === "system" ? "System" : botName(m.botId);
  const full = m.parts
    .map((p) => (p.type === "text" ? readable(p.text, bots) : p.type === "question" ? `[asked: ${p.question}]` : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  const text = full.length > MESSAGE_CAP ? `${full.slice(0, MESSAGE_CAP)}\n[truncated, ${full.length - MESSAGE_CAP} more chars]` : full;
  const files = m.parts.flatMap((p) => (p.type === "file" ? [p.name] : []));
  const attachments = files.length ? `\n[attachments: ${files.join(", ")}]` : "";
  return `#${m.seq} · ${isoTime(m.createdAt)} · ${author}:\n${text || "(no text)"}${attachments}`;
}

async function askApproval(ctx: TurnContext, tool: string, summary: string): Promise<"allow" | "deny"> {
  const requestId = crypto.randomUUID();
  const part: MessagePart = { type: "approval", requestId, tool, summary };
  const index = ctx.addPart(part);
  publishThread(ctx.threadId);
  const prev = getStatus(ctx.botId);
  setStatus(ctx.botId, { state: "blocked", text: `Needs your OK: ${tool}`, threadId: ctx.threadId });
  const decision = await new Promise<"allow" | "deny">((res) => {
    pendingApprovals.set(requestId, { resolve: res, ctx, index });
    if (ctx.signal.aborted) decideApproval(requestId, "deny");
    else ctx.signal.addEventListener("abort", () => decideApproval(requestId, "deny"), { once: true });
  });
  ctx.updatePart(index, { ...part, decision });
  publishThread(ctx.threadId);
  if (isLive(ctx)) setStatus(ctx.botId, { state: "working", text: prev.text, threadId: ctx.threadId });
  return decision;
}

function findTeammate(name: string, ctx: TurnContext): Bot | string {
  const found = botsNamed(name, db.listBots());
  if (!found.length) return `No teammate named "${name}". Call list_bots to see who exists.`;
  if (found.length > 1) return `"${name}" matches ${found.map((b) => b.name).join(", ")}. Use their exact name.`;
  if (found[0]!.id === ctx.botId) return `"${name}" is you.`;
  return found[0]!;
}

const tools: ToolDef[] = [
  {
    name: "list_bots",
    description: "List your teammates: name, role, provider and what they're doing right now.",
    inputSchema: { type: "object", properties: {} },
    run(_args, ctx) {
      return db
        .listBots()
        .filter((b) => b.id !== ctx.botId)
        .map((b) => {
          const s = getStatus(b.id);
          return `- ${b.name} (${b.provider}): ${b.role || "general helper"} — ${s.state}${s.text ? `: ${s.text}` : ""}`;
        })
        .join("\n") || "No teammates yet.";
    },
  },
  {
    name: "message_bot",
    description:
      "Send a message to a teammate and wait for their reply. Use it to delegate a task or ask for their expertise. Give them full context; they can't see your thread.",
    inputSchema: {
      type: "object",
      properties: { bot: str("Teammate name, e.g. 'Design'"), message: str("What you need from them") },
      required: ["bot", "message"],
    },
    async run(args, ctx) {
      const from = db.getBot(ctx.botId)!;
      const to = db.findBotByName(String(args.bot));
      if (!to) return `No teammate named "${args.bot}". Call list_bots to see who exists.`;
      if (to.id === from.id) return "That's you.";
      setStatus(from.id, { state: "waiting", text: `Waiting on ${to.name}`, threadId: ctx.threadId });
      const reply = await messageBot(from, to, String(args.message), ctx.depth);
      setStatus(from.id, { state: "working", text: `Got reply from ${to.name}`, threadId: ctx.threadId });
      return `${to.name} replied:\n\n${reply}`;
    },
  },
  {
    name: "ask_user",
    description:
      "Ask the user a short multiple-choice question (2–6 options). They tap an option on their phone; their answer arrives as your next message. End your turn after calling this.",
    inputSchema: {
      type: "object",
      properties: {
        question: str("The question, one sentence"),
        options: { type: "array", items: { type: "string" }, description: "2–6 short options" },
      },
      required: ["question", "options"],
    },
    run(args, ctx) {
      const options = (Array.isArray(args.options) ? args.options : []).map(String).slice(0, 6);
      if (options.length < 2) return "Give at least two options.";
      ctx.addPart({ type: "question", question: String(args.question), options });
      publishThread(ctx.threadId);
      setStatus(ctx.botId, { state: "blocked", text: "Waiting for your answer", threadId: ctx.threadId });
      return "Question posted. End your turn now; the user's choice will arrive as a new message.";
    },
  },
  {
    name: "share_file",
    description: "Attach a file you created (or found) to this conversation so the user can open it from any device.",
    inputSchema: {
      type: "object",
      properties: { path: str("Path to the file, absolute or relative to your workspace") },
      required: ["path"],
    },
    run(args, ctx) {
      const bot = db.getBot(ctx.botId)!;
      const p = String(args.path);
      const full = isAbsolute(p) ? p : resolve(bot.cwd, p);
      if (!existsSync(full) || !statSync(full).isFile()) return `No file at ${full}`;
      const size = statSync(full).size;
      if (size > 50 * 1024 * 1024) return "File is over 50 MB; share a smaller file or a link.";
      const f = db.addFile({ thread_id: ctx.threadId, bot_id: ctx.botId, path: "", name: basename(full), size });
      const stored = join(FILES_DIR, f.id);
      copyFileSync(full, stored);
      db.db.query("UPDATE files SET path = ? WHERE id = ?").run(stored, f.id);
      ctx.addPart({ type: "file", fileId: f.id, name: f.name, size });
      return `Shared ${f.name} (${size} bytes).`;
    },
  },
  {
    name: "set_status",
    description: "Show a short live status under your avatar, e.g. 'Reading tomorrow's calendar'. Under 8 words.",
    inputSchema: { type: "object", properties: { text: str("Status line") }, required: ["text"] },
    run(args, ctx) {
      setStatus(ctx.botId, { state: "working", text: clip(String(args.text), 60), threadId: ctx.threadId });
      return "ok";
    },
  },
  {
    name: "set_topic",
    description: "Tag the current thread with a 1–3 word topic, e.g. 'Meal prepping'.",
    inputSchema: { type: "object", properties: { topic: str("Topic") }, required: ["topic"] },
    run(args, ctx) {
      const t = db.updateThread(ctx.threadId, { topic: clip(String(args.topic), 32) });
      if (t) publish({ type: "thread", thread: t });
      return "ok";
    },
  },
  {
    name: "notify_user",
    description:
      "Post a message to the user in your direct thread with them. Use from routines or bot-to-bot channels when something needs their attention.",
    inputSchema: { type: "object", properties: { message: str("Message") }, required: ["message"] },
    run(args, ctx) {
      const t = directThread(ctx.botId);
      if (t.id === ctx.threadId) return "You're already talking to the user here; just reply.";
      const m = db.addMessage({ threadId: t.id, author: "bot", botId: ctx.botId, fromBotId: ctx.botId, parts: [{ type: "text", text: linkHandles(String(args.message), db.listBots()) }] });
      publish({ type: "message", message: m });
      const updated = db.updateThread(t.id, { preview: clip(String(args.message), 140), unread: t.unread + 1 });
      if (updated) publish({ type: "thread", thread: updated });
      return "Sent.";
    },
  },
  {
    name: "list_threads",
    description:
      "List Fabs Bot threads (direct chats, groups, bot-to-bot channels), most recent activity first. Read-only. Pass next_cursor back to get the next page.",
    inputSchema: {
      type: "object",
      properties: {
        cursor: str("next_cursor from your last list_threads call; leave out for the first page"),
        limit: { type: "number", description: `Threads per page, 1–${PAGE_MAX} (default ${PAGE_DEFAULT})` },
      },
    },
    run(args) {
      const limit = pageLimit(args.limit);
      const rows = db.pageThreads(threadCursor(args.cursor), limit + 1);
      if (!rows.length) return "No threads.";
      const entries: string[] = [];
      let used = 0;
      let last = rows[0]!;
      for (const t of rows.slice(0, limit)) {
        const entry = `- ${describeThread(t)}`;
        if (entries.length && used + entry.length > READ_BUDGET) break;
        entries.push(entry);
        used += entry.length;
        last = t;
      }
      const next = rows.length > entries.length ? `next_cursor: ${last.updatedAt}:${last.id}` : "No more threads.";
      return [...entries, next].join("\n");
    },
  },
  {
    name: "read_thread",
    description:
      "Read a page of messages from any thread, oldest first, without posting to it or joining it. Pass next_after_seq back as after_seq to continue. Very long messages are truncated.",
    inputSchema: {
      type: "object",
      properties: {
        thread_id: str("Thread id from list_threads"),
        after_seq: { type: "number", description: "Only messages after this seq; leave out to start at the beginning" },
        limit: { type: "number", description: `Messages per page, 1–${PAGE_MAX} (default ${PAGE_DEFAULT})` },
      },
      required: ["thread_id"],
    },
    run(args) {
      const thread = db.getThread(String(args.thread_id ?? ""));
      if (!thread) throw new Error(`No thread with id "${args.thread_id}". Call list_threads to find one.`);
      const afterSeq = seqCursor(args.after_seq);
      const limit = pageLimit(args.limit);
      const bots = db.listBots();
      const rows = db.pageMessages(thread.id, afterSeq, limit + 1);
      const entries: string[] = [];
      let used = 0;
      let lastSeq = afterSeq;
      for (const m of rows.slice(0, limit)) {
        const entry = describeMessage(m, bots);
        if (entries.length && used + entry.length > READ_BUDGET) break;
        entries.push(entry);
        used += entry.length;
        lastSeq = m.seq;
      }
      const next = rows.length > entries.length ? `next_after_seq: ${lastSeq}` : "End of thread.";
      const body = entries.length ? entries.join("\n\n") : `No messages after seq ${afterSeq}.`;
      return `Thread ${describeThread(thread)}\n\n${body}\n\n${next}`;
    },
  },
  {
    name: "schedule_routine",
    description:
      "Create a recurring routine for yourself. At each run you get `prompt` as a new message in a dedicated thread. Cron uses the PC's local time, e.g. '41 8 * * 0' = Sundays 8:41.",
    inputSchema: {
      type: "object",
      properties: { name: str("Short name"), cron: str("5-field cron expression"), prompt: str("What to do each run") },
      required: ["name", "cron", "prompt"],
    },
    run(args, ctx) {
      let next: Date | null;
      try {
        next = new Cron(String(args.cron), { paused: true }).nextRun();
      } catch (e) {
        return `Invalid cron: ${(e as Error).message}`;
      }
      const r = db.saveRoutine({
        id: db.newId(),
        botId: ctx.botId,
        name: String(args.name),
        cron: String(args.cron),
        prompt: String(args.prompt),
        threadId: null,
        enabled: true,
      });
      reschedule();
      return `Routine "${r.name}" scheduled (id ${r.id}). Next run: ${next?.toString() ?? "never"}.`;
    },
  },
  {
    name: "list_routines",
    description: "List your routines.",
    inputSchema: { type: "object", properties: {} },
    run(_args, ctx) {
      const rs = db.listRoutines(ctx.botId);
      return rs.length ? rs.map((r) => `- ${r.id} "${r.name}" ${r.cron} ${r.enabled ? "" : "(paused)"}: ${r.prompt}`).join("\n") : "No routines.";
    },
  },
  {
    name: "delete_routine",
    description: "Delete one of your routines by id.",
    inputSchema: { type: "object", properties: { id: str("Routine id") }, required: ["id"] },
    run(args, ctx) {
      const r = db.getRoutine(String(args.id));
      if (!r || r.botId !== ctx.botId) return "No such routine.";
      db.deleteRoutine(r.id);
      reschedule();
      return "Deleted.";
    },
  },
  {
    name: "start_group",
    description:
      "Start a new group chat with the user, you and the named teammates. The user must approve it first. The current chat stays as it is.",
    inputSchema: {
      type: "object",
      properties: {
        bots: { type: "array", items: { type: "string" }, description: "Teammate names, e.g. ['Design', 'Engineer']" },
        title: str("Group title, e.g. 'Launch plan'"),
      },
      required: ["bots", "title"],
    },
    async run(args, ctx) {
      const names = (Array.isArray(args.bots) ? args.bots : []).map(String);
      if (!names.length) return "Name at least one teammate.";
      const title = clip(String(args.title ?? "").trim(), 80);
      if (!title) return "Give the group a title.";
      const picked: Bot[] = [];
      for (const name of names) {
        const bot = findTeammate(name, ctx);
        if (typeof bot === "string") return bot;
        if (!picked.some((b) => b.id === bot.id)) picked.push(bot);
      }
      const who = picked.map((b) => b.name).join(", ");
      if ((await askApproval(ctx, "start_group", `Start "${title}" with ${who}`)) === "deny") {
        return `The user declined starting "${title}". Nothing changed.`;
      }
      if (!db.getBot(ctx.botId) || picked.some((b) => !db.getBot(b.id))) return "A teammate was deleted meanwhile. Nothing changed.";
      const thread = db.createThread("group", [ctx.botId, ...picked.map((b) => b.id)], title);
      publish({ type: "thread", thread });
      return `Started group "${title}" (id ${thread.id}) with the user, you and ${who}. It's empty; the user picks it up from their sidebar.`;
    },
  },
  {
    name: "invite_bot",
    description: "Add a teammate to this group chat. The user must approve it first. Only works in group chats; elsewhere use start_group.",
    inputSchema: { type: "object", properties: { name: str("Teammate name, e.g. 'Engineer'") }, required: ["name"] },
    async run(args, ctx) {
      const thread = db.getThread(ctx.threadId);
      if (thread?.kind !== "group") return "This isn't a group chat. Use start_group to open a new group with the user and your teammates.";
      const bot = findTeammate(String(args.name), ctx);
      if (typeof bot === "string") return bot;
      if (thread.memberIds.includes(bot.id)) return `${bot.name} is already in this chat.`;
      if ((await askApproval(ctx, "invite_bot", `Add ${bot.name} to this chat`)) === "deny") {
        return `The user declined adding ${bot.name}. Nothing changed.`;
      }
      if (db.getThread(ctx.threadId)?.memberIds.includes(bot.id)) return `${bot.name} is already in this chat.`;
      if (!bringInBot(ctx.threadId, bot.id)) return "This chat or teammate no longer exists. Nothing changed.";
      return `${bot.name} joined this chat. Write @${handleOf(bot.name)} to hand them the floor.`;
    },
  },
  {
    name: "approve",
    description: "Internal: permission prompt relay. Do not call directly.",
    inputSchema: {
      type: "object",
      properties: { tool_name: { type: "string" }, input: { type: "object" }, tool_use_id: { type: "string" } },
    },
    async run(args, ctx) {
      const input = args.input ?? {};
      const summary = clip(String(input.command ?? input.file_path ?? input.url ?? JSON.stringify(input)), 300);
      const decision = await askApproval(ctx, String(args.tool_name), summary);
      return JSON.stringify(
        decision === "allow" ? { behavior: "allow", updatedInput: input } : { behavior: "deny", message: "The user declined this action." },
      );
    },
  },
];

type RpcRequest = { jsonrpc: "2.0"; id?: number | string; method: string; params?: any };

export async function handleMcp(req: Request, token: string): Promise<Response> {
  if (req.method === "GET") return new Response("SSE not supported", { status: 405 });
  if (req.method === "DELETE") return new Response(null, { status: 204 });
  const ctx = turnsByToken.get(token);
  if (!ctx) return new Response("turn is over", { status: 404 });

  const body = (await req.json()) as RpcRequest | RpcRequest[];
  const batch = Array.isArray(body) ? body : [body];
  const responses = (await Promise.all(batch.map((r) => handleRpc(r, ctx)))).filter(Boolean);
  if (!responses.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? responses : responses[0], {
    headers: { "Mcp-Session-Id": token },
  });
}

async function handleRpc(r: RpcRequest, ctx: TurnContext) {
  if (r.id === undefined) return null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: r.id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: r.id, error: { code, message } });
  switch (r.method) {
    case "initialize":
      return ok({
        protocolVersion: r.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "fabsbot", version: VERSION },
        instructions: "Tools for working with the Fabs Bot team: message teammates, ask the user, share files, set status.",
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const tool = tools.find((t) => t.name === r.params?.name);
      if (!tool) return fail(-32602, `Unknown tool ${r.params?.name}`);
      try {
        const text = await tool.run(r.params?.arguments ?? {}, ctx);
        return ok({ content: [{ type: "text", text }] });
      } catch (e) {
        return ok({ content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${r.method}`);
  }
}
