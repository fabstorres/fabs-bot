import { hostname, userInfo } from "node:os";
import { mkdirSync } from "node:fs";
import { handleOf, linkHandles, mentionedBots, readable } from "../shared/mentions";
import type { Bot, Message, MessagePart, Thread } from "../shared/types";
import { LOCAL_BASE, MAX_HOPS, SHARED_DIR } from "./config";
import * as db from "./db";
import { endLink, getStatus, publish, setStatus, startLink } from "./bus";
import { connectorsForRun } from "./connectors";
import { launchFor, providers } from "./providers";
import type { ProviderEvent } from "./providers/types";
import { clip } from "./providers/spawn";

/** Everything the MCP endpoint needs to know about the turn that is calling it. */
export interface TurnContext {
  token: string;
  turnId: string;
  botId: string;
  threadId: string;
  depth: number;
  hops: number;
  signal: AbortSignal;
  messageId: string;
  editParts(edit: (parts: MessagePart[]) => void): void;
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

const DONE_MS = 2500;
const settling = new Map<string, ReturnType<typeof setTimeout>>();

function settle(botId: string) {
  clearTimeout(settling.get(botId));
  setStatus(botId, { state: "done", text: "", threadId: null });
  settling.set(
    botId,
    setTimeout(() => {
      settling.delete(botId);
      if (getStatus(botId).state === "done") setStatus(botId, { state: "idle" });
    }, DONE_MS),
  );
}

export interface TurnOptions {
  /** How many bot-to-bot hops led here; stops runaway conversations. */
  hops?: number;
  /** Nesting depth of message_bot calls. */
  depth?: number;
  canPass?: boolean;
}

export const PASS = "[pass]";

function passText(parts: MessagePart[]) {
  if (!parts.every((p) => p.type === "text" || p.type === "tool")) return null;
  return parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim().toLowerCase();
}

function mayPass(parts: MessagePart[]) {
  const text = passText(parts);
  return text !== null && PASS.startsWith(text);
}

function isPass(parts: MessagePart[]) {
  const text = passText(parts);
  return text === PASS || text === "";
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

/** Edit a message's parts through its running turn when it is still streaming, so the turn's next flush keeps the edit. */
export function editMessageParts(messageId: string, edit: (parts: MessagePart[]) => void) {
  const live = [...turnsByToken.values()].find((t) => t.messageId === messageId);
  if (live) return live.editParts(edit);
  const m = db.getMessage(messageId);
  if (!m) return;
  edit(m.parts);
  publish({ type: "message", message: db.updateMessage(m.id, m.parts) });
}

const closeQuestions = (parts: MessagePart[]) => {
  for (const p of parts) {
    if (p.type === "question" && p.answered === undefined) p.answered = -1;
    if (p.type === "screen" && !p.outcome) p.outcome = "closed";
  }
};

const isOpenCard = (p: MessagePart) => (p.type === "question" && p.answered === undefined) || (p.type === "screen" && !p.outcome);

export function isBusy(threadId: string, botId: string) {
  return queues.has(key(threadId, botId));
}

export function systemPrompt(bot: Bot, thread: Thread, unavailable: string[] = []): string {
  const team = db
    .listBots()
    .filter((b) => b.id !== bot.id)
    .map((b) => `- ${b.name}: ${b.role || "general helper"}`)
    .join("\n");
  const supportsTools = providers[bot.provider].supportsTools;
  const members = thread.memberIds.filter((id) => id !== bot.id).map((id) => db.getBot(id)).filter((b): b is Bot => !!b);
  const user = userInfo().username;
  const approval = bot.isTeamLead ? "You are the team lead, so it happens without asking the user." : "The user approves it first.";

  const lines = [
    `You are ${bot.name}, one of the bots in Fabs Bot: a team of always-on agents that live on ${user}'s PC ("${hostname()}") and use it as their workplace. ${user} talks to you from their phone or laptop, often away from the desk.`,
    bot.role ? `Your role: ${bot.role}` : "",
    bot.instructions ? `\n${bot.instructions}\n` : "",
    `Workplace:`,
    `- Your workspace folder is ${bot.cwd}. Keep your work there unless asked otherwise.`,
    `- ${SHARED_DIR} is shared by every bot. Use it to hand files to teammates.`,
    team ? `\nYour teammates:\n${team}` : "\nYou have no teammates yet.",
    `\nThis chat: ${thread.kind} chat${thread.title ? ` "${thread.title}"` : ""}, id ${thread.id}.`,
    `- This chat owns its context. Shared files, your workspace, or memory from other chats don't make another chat's project relevant here.`,
    `- Only bring up or read another chat when the user asks or it is clearly relevant to this one.`,
    `- If the user starts work on a different project, suggest starting a new chat for it.`,
    thread.kind === "group" && members.length
      ? `\nThis is a group thread with ${members.map((b) => `@${handleOf(b.name)} (${b.role || "general helper"})`).join(", ")}. Write a teammate's handle to hand them the floor; only do that when you need them. If nobody @mentioned you and the message isn't for your role, reply with exactly ${PASS} and nothing else.`
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
      `- list_threads / read_thread: read any thread without posting to it, e.g. to summarize a group chat. Read a page at a time with next_cursor / next_after_seq instead of loading everything.`,
      `- start_group: open a new group chat with the user, you and named teammates. ${approval} Your kickoff is its first message: the context and who owns what, with each teammate's @handle to start them. The user is taken to the group, and the teamwork and its results belong there through @mention hand-offs, not in this chat or message_bot.`,
      `- invite_bot: add a teammate to this group chat. ${approval} Outside a group, use start_group.`,
      `- screen_open / screen_read / screen_click / screen_type / screen_press / screen_scroll / screen_wait / screen_close: your own Chromium browser, which the user watches as "${bot.name}'s screen". Open a page, read it to get element refs, act on a ref, then read again. It keeps your logins between chats, so stay signed in.`,
      `- screen_hand_over: when a page needs something only the user can do (signing in, a CAPTCHA, a payment), ask them to take over your screen, then end your turn.`,
    );
  }
  if (unavailable.length)
    lines.push(
      `\nThese plugins are turned on for you, but their tools are missing right now: ${unavailable.join(", ")}. If a task needs one, tell the user to open Settings in Fabs Bot and fix it under Plugins.`,
    );
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
          return readable(p.text, db.listBots());
        case "file":
          return `[file: ${p.name} at ${db.getFile(p.fileId)?.path ?? "(missing)"}]`;
        case "question":
          return `[asked: ${p.question} Options: ${p.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join(" ")}]`;
        case "screen":
          return `[asked the user to take over the screen: ${p.reason}]`;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n");
  return `[${who}]: ${body}`;
}

/** Messages a bot hasn't seen yet. Its own turn output is already in its session; tool-sent messages are not. */
function unseen(threadId: string, bot: Bot, afterSeq: number, includeOwn = false): Message[] {
  return db
    .listMessages(threadId, afterSeq)
    .filter((m) => (includeOwn || !(m.author === "bot" && m.botId === bot.id && m.fromBotId === null)) && m.status !== "streaming");
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

  const pending = unseen(threadId, bot, resume ? member.last_seen_seq : 0, !resume);
  const fresh = !resume;
  const newSinceLast = resume ? pending : unseen(threadId, bot, member.last_seen_seq);
  if (newSinceLast.length === 0) return null;
  const snapshotSeq = Math.max(...pending.map((m) => m.seq), member.last_seen_seq);

  mkdirSync(bot.cwd, { recursive: true });
  const token = crypto.randomUUID();
  const ctrl = new AbortController();
  aborts.set(key(threadId, botId), ctrl);
  activeTurns.set(botId, (activeTurns.get(botId) ?? 0) + 1);
  setStatus(botId, { state: "thinking", text: "Thinking…", threadId });

  const parts: MessagePart[] = [];
  let msg = db.addMessage({ threadId, author: "bot", botId, parts, status: "streaming" });
  publish({ type: "message", message: msg });

  let dirty = false;
  const flush = () => {
    if (!dirty || (opts.canPass && mayPass(parts))) return;
    dirty = false;
    msg = db.updateMessage(msg.id, parts);
    publish({ type: "message", message: msg });
  };
  const timer = setInterval(flush, 150);
  const touch = () => (dirty = true);

  const ctx: TurnContext = {
    token,
    turnId: crypto.randomUUID(),
    botId,
    threadId,
    depth: opts.depth ?? 0,
    hops: opts.hops ?? 0,
    signal: ctrl.signal,
    messageId: msg.id,
    editParts(edit) {
      edit(parts);
      touch();
      flush();
    },
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
          if (e.error && e.summary && p.name.startsWith("fabsbot · ")) p.summary = clip(e.summary, 160);
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
    const plugins = await connectorsForRun(bot);
    const launch = launchFor(bot.provider);
    await provider.run(
      {
        bot,
        launch: { ...launch, env: { ...launch.env, ...plugins.env } },
        prompt: buildPrompt(thread, bot, pending, fresh),
        systemPrompt: systemPrompt(bot, thread, plugins.unavailable),
        sessionId: resume,
        cwd: bot.cwd,
        mcpUrl: `${LOCAL_BASE}/mcp/${token}`,
        connectors: plugins.connectors,
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
  const passed = !!opts.canPass && !error && isPass(parts);
  let replyText = "";
  if (passed) {
    db.deleteMessage(msg.id);
    publish({ type: "message.deleted", threadId, messageId: msg.id });
  } else {
    for (const p of parts) if (p.type === "tool" && p.status === "running") p.status = error ? "error" : "done";
    if (error) parts.push({ type: "text", text: error });
    const hasContent = parts.some((p) => p.type !== "text" || p.text.trim());
    if (!hasContent) parts.push({ type: "text", text: "_(no reply)_" });
    const bots = db.listBots();
    for (const p of parts) if (p.type === "text") p.text = linkHandles(p.text, bots);
    msg = db.updateMessage(msg.id, parts, error ? "error" : "done");
    publish({ type: "message", message: msg });

    replyText = textOf(msg);
    const t = db.updateThread(threadId, {
      preview: clip(plain(readable(replyText, bots)) || lastPartSummary(parts), 140),
      unread: (db.getThread(threadId)?.unread ?? 0) + 1,
    });
    if (t) publish({ type: "thread", thread: t });
  }

  const remaining = (activeTurns.get(botId) ?? 1) - 1;
  activeTurns.set(botId, remaining);
  const asked = parts.some((p) => p.type === "question" && p.answered === undefined);
  const handedOver = parts.some((p) => p.type === "screen" && !p.outcome);
  if (remaining <= 0) {
    if (error) setStatus(botId, { state: "error", text: clip(error, 60), threadId: null });
    else if (handedOver) setStatus(botId, { state: "blocked", text: "Needs you on its screen", threadId });
    else if (asked) setStatus(botId, { state: "blocked", text: "Waiting for your answer", threadId });
    else settle(botId);
  }

  const later = db.listMessages(threadId, snapshotSeq).filter((m) => m.author === "user");
  if (later.length && !ctrl.signal.aborted) void runTurn(threadId, botId, opts);

  if (thread.kind === "group" && !passed && !error && !ctrl.signal.aborted) {
    const hops = (opts.hops ?? 0) + 1;
    if (hops <= MAX_HOPS) {
      for (const target of mentioned(replyText, db.getThread(threadId) ?? thread, botId)) void runTurn(threadId, target, { hops });
    }
  }
  return passed ? null : msg;
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
  const named = mentionedBots(text, db.listBots()).map((b) => b.id);
  return thread.memberIds.filter((id) => id !== selfId && named.includes(id));
}

/** The user posts in a thread; decide who answers. */
export async function postUserMessage(threadId: string, parts: MessagePart[]) {
  const thread = db.getThread(threadId);
  if (!thread) throw new Error("thread not found");
  for (const open of db.listMessages(threadId).filter((m) => m.parts.some(isOpenCard))) {
    editMessageParts(open.id, closeQuestions);
  }
  const m = db.addMessage({ threadId, author: "user", parts });
  publish({ type: "message", message: m });
  const text = textOf(m);
  const t = db.updateThread(threadId, { preview: clip(readable(text, db.listBots()) || "📎 file", 140), unread: 0 });
  if (t) publish({ type: "thread", thread: t });

  const named = mentioned(text, thread, null);
  const targets = named.length ? named : thread.kind === "direct" ? thread.memberIds : thread.memberIds;
  if (thread.kind === "group" && !named.length) {
    const queuedAt = stopCount(threadId);
    void (async () => {
      for (const id of targets) if (stopCount(threadId) === queuedAt) await runTurn(threadId, id, { canPass: true });
      if (stopCount(threadId) === queuedAt && !db.listMessages(threadId, m.seq).some((r) => r.author === "bot")) nobodyTookIt(threadId);
    })();
  } else {
    for (const id of targets) void runTurn(threadId, id);
  }
  return m;
}

function nobodyTookIt(threadId: string) {
  const text = "Nobody took this one. @mention a bot to ask them directly.";
  const m = db.addMessage({ threadId, author: "system", parts: [{ type: "text", text }] });
  publish({ type: "message", message: m });
  const t = db.updateThread(threadId, { preview: text, unread: (db.getThread(threadId)?.unread ?? 0) + 1 });
  if (t) publish({ type: "thread", thread: t });
}

export function kickoff(threadId: string, botId: string, linked: string, hops: number): string[] {
  const bots = db.listBots();
  const m = db.addMessage({ threadId, author: "bot", botId, fromBotId: botId, parts: [{ type: "text", text: linked }] });
  publish({ type: "message", message: m });
  const thread = db.updateThread(threadId, { preview: clip(plain(readable(linked, bots)), 140), unread: (db.getThread(threadId)?.unread ?? 0) + 1 });
  if (!thread) return [];
  publish({ type: "thread", thread });
  if (hops + 1 > MAX_HOPS) return [];
  const targets = mentioned(linked, thread, botId);
  for (const id of targets) void runTurn(threadId, id, { hops: hops + 1 });
  return targets;
}

/** One bot messages another through their private backchannel and waits for the reply. */
export async function messageBot(from: Bot, to: Bot, text: string, depth: number, hops = 0): Promise<string> {
  if (depth >= 3) return "Not sent: too many nested bot-to-bot messages. Finish with what you have.";
  let thread = db.findBackchannel(from.id, to.id);
  if (!thread) {
    thread = db.createThread("backchannel", [from.id, to.id], `${from.name} ↔ ${to.name}`, { actor: "bot" });
    publish({ type: "thread", thread });
  }
  const m = db.addMessage({ threadId: thread.id, author: "bot", botId: from.id, fromBotId: from.id, parts: [{ type: "text", text: linkHandles(text, db.listBots()) }] });
  publish({ type: "message", message: m });
  const t = db.updateThread(thread.id, { preview: clip(`${from.name}: ${text}`, 140) });
  if (t) publish({ type: "thread", thread: t });

  const link = startLink(from.id, to.id, thread.id);
  try {
    const reply = await runTurn(thread.id, to.id, { depth: depth + 1, hops });
    return reply ? readable(textOf(reply), db.listBots()) || "(they replied without text)" : "(no reply)";
  } finally {
    endLink(link);
  }
}

/** Find (or open) the user's direct thread with a bot. */
export function directThread(botId: string, origin?: db.EventOrigin): Thread {
  const existing = db.listThreads().find((t) => t.kind === "direct" && t.memberIds.length === 1 && t.memberIds[0] === botId);
  if (existing) return existing;
  const t = db.createThread("direct", [botId], "", origin);
  publish({ type: "thread", thread: t });
  return t;
}

export function bringInBot(threadId: string, botId: string, origin?: db.EventOrigin): Thread | null {
  const thread = db.getThread(threadId);
  if (!thread || !db.getBot(botId)) return null;
  if (thread.memberIds.includes(botId)) return thread;
  if (thread.kind === "direct") {
    const group = db.createThread("group", [...thread.memberIds, botId], "", origin);
    publish({ type: "thread", thread: group });
    return group;
  }
  db.addMember(threadId, botId);
  const t = db.getThread(threadId)!;
  publish({ type: "thread", thread: t });
  return t;
}

const GREETING_OPTIONS = ["Day-to-day ops", "A specific project", "Research and writing", "Something else"];

/** Open a new bot's direct chat with a hello and a first question, so it's ready to go. */
export function greet(bot: Bot): Thread {
  const thread = directThread(bot.id);
  const text = `Hey, I'm ${bot.name}. What's the main thing you want me on?`;
  const m = db.addMessage({
    threadId: thread.id,
    author: "bot",
    botId: bot.id,
    parts: [
      { type: "text", text },
      { type: "question", question: "What should I own for you?", options: GREETING_OPTIONS, greeting: true },
    ],
  });
  publish({ type: "message", message: m });
  const t = db.updateThread(thread.id, { preview: text, unread: 1 })!;
  publish({ type: "thread", thread: t });
  return t;
}
