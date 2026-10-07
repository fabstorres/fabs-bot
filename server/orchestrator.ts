import { hostname, userInfo } from "node:os";
import { mkdirSync } from "node:fs";
import type { Bot, Message, MessagePart, Thread } from "../shared/types";
import { LOCAL_BASE, MAX_HOPS, SHARED_DIR } from "./config";
import * as db from "./db";
import { endLink, publish, setStatus, startLink } from "./bus";
import { providers } from "./providers";
import type { ProviderEvent } from "./providers/types";
import { clip } from "./providers/spawn";

/** Everything the MCP endpoint needs to know about the turn that is calling it. */
export interface TurnContext {
  token: string;
  botId: string;
  threadId: string;
  depth: number;
  signal: AbortSignal;
  addPart(part: MessagePart): number;
  updatePart(index: number, part: MessagePart): void;
}
export const turnsByToken = new Map<string, TurnContext>();

const queues = new Map<string, Promise<unknown>>();
const aborts = new Map<string, AbortController>();
/** Running turn count per bot. */
const activeTurns = new Map<string, number>();

const stops = new Map<string, number>();

const key = (threadId: string, botId: string) => `${threadId}:${botId}`;
const stopCount = (threadId: string) => stops.get(threadId) ?? 0;

export interface TurnOptions {
  /** How many bot-to-bot hops led here; stops runaway conversations. */
  hops?: number;
  /** Nesting depth of message_bot calls. */
  depth?: number;
}

/** Queue a turn for `botId` in `threadId`. Resolves with the bot's reply message (or null if it had nothing to answer). */
export function runTurn(threadId: string, botId: string, opts: TurnOptions = {}): Promise<Message | null> {
  const k = key(threadId, botId);
  const queuedAt = stopCount(threadId);
  const prev = queues.get(k) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() => (stopCount(threadId) === queuedAt ? executeTurn(threadId, botId, opts) : null));
  queues.set(k, next);
  next.finally(() => {
    if (queues.get(k) === next) queues.delete(k);
  });
  return next;
}

/** Abort running turns in a thread and drop the ones queued before the stop. */
export function stopTurns(threadId: string) {
  stops.set(threadId, stopCount(threadId) + 1);
  for (const [k, ctrl] of aborts) if (k.startsWith(threadId + ":")) ctrl.abort();
}

export function isBusy(threadId: string, botId: string) {
  return queues.has(key(threadId, botId));
}

export function systemPrompt(bot: Bot, thread: Thread): string {
  const team = db
    .listBots()
    .filter((b) => b.id !== bot.id)
    .map((b) => `- ${b.name}: ${b.role || "general helper"}`)
    .join("\n");
  const supportsTools = providers[bot.provider].supportsTools;
  const members = thread.memberIds.filter((id) => id !== bot.id).map((id) => db.getBot(id)?.name).filter(Boolean);
  const user = userInfo().username;

  const lines = [
    `You are ${bot.name}, one of the bots in Fabs Bot: a team of always-on agents that live on ${user}'s PC ("${hostname()}") and use it as their workplace. ${user} talks to you from their phone or laptop, often away from the desk.`,
    bot.role ? `Your role: ${bot.role}` : "",
    bot.instructions ? `\n${bot.instructions}\n` : "",
    `Workplace:`,
    `- Your workspace folder is ${bot.cwd}. Keep your work there unless asked otherwise.`,
    `- ${SHARED_DIR} is shared by every bot. Use it to hand files to teammates.`,
    team ? `\nYour teammates:\n${team}` : "\nYou have no teammates yet.",
    thread.kind === "group" && members.length
      ? `\nThis is a group thread with ${members.join(", ")}. Write @Name to hand a teammate the floor; only do that when you need them.`
      : "",
    thread.kind === "backchannel"
      ? `\nThis is a private channel between you and another bot. Answer them directly and completely; the user may read it later.`
      : "",
  ];
  if (supportsTools) {
    lines.push(
      `\nTools on the "fabsbot" MCP server (mcp__fabsbot__*). They are the ONLY way to reach teammates, the user's phone, and schedules; never use other agent-messaging, cron, or notification tools for this:`,
      `- message_bot: delegate to or consult a teammate, and get their reply back.`,
      `- ask_user: when you need a decision, post a short multiple-choice question, then end your turn and wait.`,
      `- share_file: attach a file you produced so the user can open it from their phone.`,
      `- set_status: one short line (under 8 words) saying what you are doing right now. Update it as you go.`,
      `- set_topic: tag this thread with a 1–3 word topic once its subject is clear.`,
      `- schedule_routine / list_routines / delete_routine: recurring work on a cron schedule.`,
      `- notify_user: ping the user in your direct thread with them, e.g. from a routine or a backchannel.`,
    );
  }
  lines.push(
    `\nThe user reads you on a phone. Lead with the result, keep replies short, use Markdown lists sparingly, and put long material in a file you share.`,
  );
  return lines.filter(Boolean).join("\n");
}

function describeMessage(m: Message, self: Bot): string {
  const who =
    m.author === "user"
      ? "User"
      : m.author === "system"
        ? "System"
        : m.botId === self.id
          ? `You (${self.name})`
          : (db.getBot(m.botId ?? "")?.name ?? "A former teammate");
  const body = m.parts
    .map((p) => {
      switch (p.type) {
        case "text":
          return p.text;
        case "file":
          return `[file: ${p.name} at ${db.getFile(p.fileId)?.path ?? "(missing)"}]`;
        case "question":
          return `[asked: ${p.question} Options: ${p.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join(" ")}]`;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n");
  return `[${who}]: ${body}`;
}

/** Messages a bot hasn't seen yet. Its own turn output is already in its session; tool-sent messages are not. */
function unseen(threadId: string, bot: Bot, afterSeq: number): Message[] {
  return db
    .listMessages(threadId, afterSeq)
    .filter((m) => !(m.author === "bot" && m.botId === bot.id && m.fromBotId === null) && m.status !== "streaming");
}

function buildPrompt(thread: Thread, bot: Bot, msgs: Message[], fresh: boolean): string {
  const onlyUser = msgs.every((m) => m.author === "user");
  if (thread.kind === "direct" && onlyUser) return msgs.map((m) => describeMessage(m, bot).replace(/^\[User\]: /, "")).join("\n\n");
  const transcript = msgs.map((m) => describeMessage(m, bot)).join("\n\n");
  return fresh
    ? `Thread so far${thread.title ? ` ("${thread.title}")` : ""}:\n\n${transcript}\n\nReply as ${bot.name}.`
    : `New in this thread since your last reply:\n\n${transcript}\n\nReply as ${bot.name}.`;
}

async function executeTurn(threadId: string, botId: string, opts: TurnOptions): Promise<Message | null> {
  const bot = db.getBot(botId);
  const thread = db.getThread(threadId);
  if (!bot || !thread) return null;
  const provider = providers[bot.provider];
  const member = db.getMember(threadId, botId) ?? { session_id: null, last_seen_seq: 0 };
  const resume = provider.resumable && member.session_id ? member.session_id : null;

  const pending = unseen(threadId, bot, resume ? member.last_seen_seq : 0);
  const fresh = !resume;
  const newSinceLast = resume ? pending : unseen(threadId, bot, member.last_seen_seq);
  if (newSinceLast.length === 0) return null;
  const snapshotSeq = Math.max(...pending.map((m) => m.seq), member.last_seen_seq);

  mkdirSync(bot.cwd, { recursive: true });
  const token = crypto.randomUUID();
  const ctrl = new AbortController();
  aborts.set(key(threadId, botId), ctrl);
  activeTurns.set(botId, (activeTurns.get(botId) ?? 0) + 1);
  setStatus(botId, { state: "working", text: "Thinking…", threadId });

  const parts: MessagePart[] = [];
  let msg = db.addMessage({ threadId, author: "bot", botId, parts, status: "streaming" });
  publish({ type: "message", message: msg });

  let dirty = false;
  const flush = () => {
    if (!dirty) return;
    dirty = false;
    msg = db.updateMessage(msg.id, parts);
    publish({ type: "message", message: msg });
  };
  const timer = setInterval(flush, 150);
  const touch = () => (dirty = true);

  const ctx: TurnContext = {
    token,
    botId,
    threadId,
    depth: opts.depth ?? 0,
    signal: ctrl.signal,
    addPart(part) {
      parts.push(part);
      touch();
      flush();
      return parts.length - 1;
    },
    updatePart(i, part) {
      parts[i] = part;
      touch();
      flush();
    },
  };
  turnsByToken.set(token, ctx);

  let sessionId = resume;
  let error: string | null = null;
  let breakNext = false;
  const toolIndex = new Map<string, number>();

  const onEvent = (e: ProviderEvent) => {
    switch (e.type) {
      case "session":
        sessionId = e.id;
        break;
      case "text.break":
        breakNext = true;
        break;
      case "text": {
        const last = parts[parts.length - 1];
        if (last?.type === "text" && !(breakNext && last.text.trim())) last.text += e.text;
        else parts.push({ type: "text", text: e.text.replace(/^\s+/, "") });
        breakNext = false;
        touch();
        break;
      }
      case "tool.start": {
        if (toolIndex.has(e.id)) break;
        toolIndex.set(e.id, parts.length);
        parts.push({ type: "tool", id: e.id, name: e.name, summary: e.summary, status: "running" });
        if (!e.name.startsWith("fabsbot · set_status")) setStatus(botId, { state: "working", text: clip(`${e.name} ${e.summary}`, 60), threadId });
        touch();
        break;
      }
      case "tool.end": {
        const i = toolIndex.get(e.id);
        const p = i !== undefined ? parts[i] : undefined;
        if (p?.type === "tool") {
          p.status = e.error ? "error" : "done";
          touch();
        }
        break;
      }
      case "error":
        error = e.message;
        break;
    }
  };

  try {
    await provider.run(
      {
        bot,
        prompt: buildPrompt(thread, bot, pending, fresh),
        systemPrompt: systemPrompt(bot, thread),
        sessionId: resume,
        cwd: bot.cwd,
        mcpUrl: `${LOCAL_BASE}/mcp/${token}`,
        connectors: db.listConnectors().filter((c) => bot.connectorIds.includes(c.id)),
        addDirs: [SHARED_DIR],
        signal: ctrl.signal,
      },
      onEvent,
    );
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    clearInterval(timer);
    turnsByToken.delete(token);
    aborts.delete(key(threadId, botId));
  }

  // A turn that never produced a session (e.g. auth failure) shouldn't advance what the bot has "seen".
  if (sessionId || !provider.resumable) db.setMemberSession(threadId, botId, sessionId, snapshotSeq);
  for (const p of parts) if (p.type === "tool" && p.status === "running") p.status = error ? "error" : "done";
  if (error) parts.push({ type: "text", text: `⚠️ ${error}` });
  const hasContent = parts.some((p) => p.type !== "text" || p.text.trim());
  if (!hasContent) parts.push({ type: "text", text: "_(no reply)_" });
  msg = db.updateMessage(msg.id, parts, error ? "error" : "done");
  publish({ type: "message", message: msg });

  const replyText = textOf(msg);
  const t = db.updateThread(threadId, {
    preview: clip(plain(replyText) || lastPartSummary(parts), 140),
    unread: (db.getThread(threadId)?.unread ?? 0) + 1,
  });
  if (t) publish({ type: "thread", thread: t });

  const remaining = (activeTurns.get(botId) ?? 1) - 1;
  activeTurns.set(botId, remaining);
  const asked = parts.some((p) => p.type === "question" && p.answered === undefined);
  if (remaining <= 0) {
    if (error) setStatus(botId, { state: "error", text: clip(error, 60), threadId: null });
    else if (asked) setStatus(botId, { state: "waiting", text: "Waiting for your answer", threadId });
    else setStatus(botId, { state: "idle", text: "", threadId: null });
  }

  const later = db.listMessages(threadId, snapshotSeq).filter((m) => m.author === "user");
  if (later.length && !ctrl.signal.aborted) void runTurn(threadId, botId, opts);

  if (thread.kind === "group" && !error && !ctrl.signal.aborted) {
    const hops = (opts.hops ?? 0) + 1;
    if (hops <= MAX_HOPS) {
      for (const target of mentioned(replyText, thread, botId)) void runTurn(threadId, target, { hops });
    }
  }
  return msg;
}

/** Plain text for one-line previews: drop Markdown punctuation. */
export function plain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~>#]+/g, "")
    .replace(/^\s*[-+]\s+/gm, "");
}

export function textOf(m: Message): string {
  return m.parts
    .filter((p): p is Extract<MessagePart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n\n")
    .trim();
}

function lastPartSummary(parts: MessagePart[]): string {
  const p = parts[parts.length - 1];
  if (!p) return "";
  if (p.type === "file") return `📎 ${p.name}`;
  if (p.type === "question") return p.question;
  if (p.type === "approval") return `Needs approval: ${p.tool}`;
  if (p.type === "tool") return p.name;
  return "";
}

/** Thread members whose name is @mentioned in `text` (excluding `selfId`). */
export function mentioned(text: string, thread: Thread, selfId: string | null): string[] {
  const lower = text.toLowerCase();
  return thread.memberIds.filter((id) => {
    if (id === selfId) return false;
    const b = db.getBot(id);
    if (!b) return false;
    const n = b.name.toLowerCase();
    return lower.includes(`@${n}`) || lower.includes(`@${db.slug(n)}`) || lower.includes(`@${n.replace(/\s+/g, "")}`);
  });
}

/** The user posts in a thread; decide who answers. */
export async function postUserMessage(threadId: string, parts: MessagePart[]) {
  const thread = db.getThread(threadId);
  if (!thread) throw new Error("thread not found");
  for (const q of db.closeOpenQuestions(threadId)) publish({ type: "message", message: q });
  const m = db.addMessage({ threadId, author: "user", parts });
  publish({ type: "message", message: m });
  const text = textOf(m);
  const t = db.updateThread(threadId, { preview: clip(text || "📎 file", 140), unread: 0 });
  if (t) publish({ type: "thread", thread: t });

  const named = mentioned(text, thread, null);
  const targets = named.length ? named : thread.kind === "direct" ? thread.memberIds : thread.memberIds;
  if (thread.kind === "group" && !named.length) {
    const queuedAt = stopCount(threadId);
    void (async () => {
      for (const id of targets) if (stopCount(threadId) === queuedAt) await runTurn(threadId, id);
    })();
  } else {
    for (const id of targets) void runTurn(threadId, id);
  }
  return m;
}

/** One bot messages another through their private backchannel and waits for the reply. */
export async function messageBot(from: Bot, to: Bot, text: string, depth: number): Promise<string> {
  if (depth >= 3) return "Not sent: too many nested bot-to-bot messages. Finish with what you have.";
  let thread = db.findBackchannel(from.id, to.id);
  if (!thread) {
    thread = db.createThread("backchannel", [from.id, to.id], `${from.name} ↔ ${to.name}`);
    publish({ type: "thread", thread });
  }
  const m = db.addMessage({ threadId: thread.id, author: "bot", botId: from.id, fromBotId: from.id, parts: [{ type: "text", text }] });
  publish({ type: "message", message: m });
  const t = db.updateThread(thread.id, { preview: clip(`${from.name}: ${text}`, 140) });
  if (t) publish({ type: "thread", thread: t });

  const link = startLink(from.id, to.id, thread.id);
  try {
    const reply = await runTurn(thread.id, to.id, { depth: depth + 1 });
    return reply ? textOf(reply) || "(they replied without text)" : "(no reply)";
  } finally {
    endLink(link);
  }
}

/** Find (or open) the user's direct thread with a bot. */
export function directThread(botId: string): Thread {
  const existing = db.listThreads().find((t) => t.kind === "direct" && t.memberIds.length === 1 && t.memberIds[0] === botId);
  if (existing) return existing;
  const t = db.createThread("direct", [botId]);
  publish({ type: "thread", thread: t });
  return t;
}
