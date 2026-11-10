import { Database } from "bun:sqlite";
import { join } from "node:path";
import { DATA_DIR } from "./config";
import type {
  Bot,
  Connector,
  Message,
  MessagePart,
  Routine,
  Thread,
  ThreadKind,
  WebhookEncoding,
} from "../shared/types";

export const db = new Database(join(DATA_DIR, "fabs-bot.db"), { create: true });
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  shape TEXT NOT NULL,
  color TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  cwd TEXT NOT NULL,
  autonomy TEXT NOT NULL DEFAULT 'full',
  connector_ids TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  preview TEXT NOT NULL DEFAULT '',
  unread INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS thread_members (
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  session_id TEXT,
  last_seen_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (thread_id, bot_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  author TEXT NOT NULL,
  bot_id TEXT,
  from_bot_id TEXT,
  parts TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_thread ON messages(thread_id, seq);
CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  cron TEXT NOT NULL,
  prompt TEXT NOT NULL,
  thread_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER
);
CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  preset TEXT NOT NULL DEFAULT 'custom',
  kind TEXT NOT NULL,
  command TEXT NOT NULL DEFAULT '',
  args TEXT NOT NULL DEFAULT '[]',
  env TEXT NOT NULL DEFAULT '{}',
  url TEXT NOT NULL DEFAULT '',
  headers TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  bot_id TEXT,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS thread_webhooks (
  thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL DEFAULT '',
  header TEXT NOT NULL DEFAULT '',
  encoding TEXT NOT NULL DEFAULT 'hex',
  prefix TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  thread_id TEXT,
  thread_kind TEXT,
  actor_category TEXT NOT NULL,
  turn_id TEXT,
  call_id TEXT,
  approval_id TEXT,
  tool_name TEXT,
  outcome_code TEXT
);
CREATE INDEX IF NOT EXISTS events_thread ON events(thread_id, created_at);
`);

const botColumns = db.query("PRAGMA table_info(bots)").all() as { name: string }[];
if (!botColumns.some((c) => c.name === "label")) db.exec("ALTER TABLE bots ADD COLUMN label TEXT NOT NULL DEFAULT ''");
if (!botColumns.some((c) => c.name === "is_team_lead")) db.exec("ALTER TABLE bots ADD COLUMN is_team_lead INTEGER NOT NULL DEFAULT 0");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS bots_one_team_lead ON bots(is_team_lead) WHERE is_team_lead = 1");

export const newId = () => crypto.randomUUID();
const now = () => Date.now();

export function getSetting(key: string): string | null {
  const row = db.query("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | null;
  return row?.value ?? null;
}
export function setSetting(key: string, value: string) {
  db.query("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

type BotRow = {
  id: string; name: string; label: string; role: string; instructions: string; shape: string; color: string;
  provider: string; model: string; cwd: string; autonomy: string; connector_ids: string; is_team_lead: number; created_at: number;
};
const toBot = (r: BotRow): Bot => ({
  id: r.id,
  name: r.name,
  label: r.label,
  role: r.role,
  instructions: r.instructions,
  shape: r.shape as Bot["shape"],
  color: r.color,
  provider: r.provider as Bot["provider"],
  model: r.model,
  cwd: r.cwd,
  autonomy: r.autonomy as Bot["autonomy"],
  connectorIds: JSON.parse(r.connector_ids),
  isTeamLead: r.is_team_lead === 1,
  createdAt: r.created_at,
});

export function listBots(): Bot[] {
  return (db.query("SELECT * FROM bots ORDER BY created_at").all() as BotRow[]).map(toBot);
}
export function getBot(id: string): Bot | null {
  const r = db.query("SELECT * FROM bots WHERE id = ?").get(id) as BotRow | null;
  return r ? toBot(r) : null;
}
export function findBotByName(name: string): Bot | null {
  const needle = name.trim().toLowerCase().replace(/^@/, "");
  return listBots().find((b) => b.name.toLowerCase() === needle || slug(b.name) === slug(needle)) ?? null;
}
export function teamLead(): Bot | null {
  return listBots().find((b) => b.isTeamLead) ?? null;
}
export const saveBot = db.transaction((bot: Omit<Bot, "createdAt"> & { createdAt?: number }): Bot => {
  if (bot.isTeamLead) db.query("UPDATE bots SET is_team_lead = 0 WHERE is_team_lead = 1 AND id != ?").run(bot.id);
  db.query(
    `INSERT INTO bots (id, name, label, role, instructions, shape, color, provider, model, cwd, autonomy, connector_ids, is_team_lead, created_at)
     VALUES ($id, $name, $label, $role, $instructions, $shape, $color, $provider, $model, $cwd, $autonomy, $connectorIds, $isTeamLead, $createdAt)
     ON CONFLICT(id) DO UPDATE SET name=$name, label=$label, role=$role, instructions=$instructions, shape=$shape, color=$color,
       provider=$provider, model=$model, cwd=$cwd, autonomy=$autonomy, connector_ids=$connectorIds, is_team_lead=$isTeamLead`,
  ).run({
    $id: bot.id,
    $name: bot.name,
    $label: bot.label,
    $role: bot.role,
    $instructions: bot.instructions,
    $shape: bot.shape,
    $color: bot.color,
    $provider: bot.provider,
    $model: bot.model,
    $cwd: bot.cwd,
    $autonomy: bot.autonomy,
    $connectorIds: JSON.stringify(bot.connectorIds),
    $isTeamLead: bot.isTeamLead ? 1 : 0,
    $createdAt: bot.createdAt ?? now(),
  });
  return getBot(bot.id)!;
});
export function deleteBot(id: string) {
  db.query("DELETE FROM bots WHERE id = ?").run(id);
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type ThreadRow = {
  id: string; title: string; topic: string; kind: string; created_at: number; updated_at: number;
  preview: string; unread: number;
};
function toThread(r: ThreadRow): Thread {
  const members = db
    .query("SELECT bot_id FROM thread_members WHERE thread_id = ? ORDER BY position")
    .all(r.id) as { bot_id: string }[];
  return {
    id: r.id,
    title: r.title,
    topic: r.topic,
    kind: r.kind as ThreadKind,
    memberIds: members.map((m) => m.bot_id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    preview: r.preview,
    unread: r.unread,
    needsYou: !!db
      .query(
        `SELECT 1 FROM messages m, json_each(m.parts) p
         WHERE m.thread_id = ?
           AND ((json_extract(p.value, '$.type') = 'question' AND json_extract(p.value, '$.answered') IS NULL
                 AND json_extract(p.value, '$.greeting') IS NULL)
             OR (json_extract(p.value, '$.type') = 'approval' AND json_extract(p.value, '$.decision') IS NULL)
             OR (json_extract(p.value, '$.type') = 'screen' AND json_extract(p.value, '$.outcome') IS NULL))
         LIMIT 1`,
      )
      .get(r.id),
  };
}

export function listThreads(): Thread[] {
  return (db.query("SELECT * FROM threads ORDER BY updated_at DESC").all() as ThreadRow[]).map(toThread);
}
export function pageThreads(before: { updatedAt: number; id: string } | null, limit: number): Thread[] {
  const rows = before
    ? db
        .query("SELECT * FROM threads WHERE (updated_at, id) < (?, ?) ORDER BY updated_at DESC, id DESC LIMIT ?")
        .all(before.updatedAt, before.id, limit)
    : db.query("SELECT * FROM threads ORDER BY updated_at DESC, id DESC LIMIT ?").all(limit);
  return (rows as ThreadRow[]).map(toThread);
}
export function getThread(id: string): Thread | null {
  const r = db.query("SELECT * FROM threads WHERE id = ?").get(id) as ThreadRow | null;
  return r ? toThread(r) : null;
}
export function createThread(kind: ThreadKind, memberIds: string[], title = "", origin: EventOrigin = { actor: "system" }): Thread {
  const id = newId();
  const t = now();
  db.transaction(() => {
    db.query("INSERT INTO threads (id, title, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, title, kind, t, t);
    memberIds.forEach((botId, i) =>
      db.query("INSERT INTO thread_members (thread_id, bot_id, position) VALUES (?, ?, ?)").run(id, botId, i),
    );
    logEvent({ type: "thread.create", threadId: id, threadKind: kind, ...origin });
  })();
  return getThread(id)!;
}
export function updateThread(id: string, patch: Partial<Pick<Thread, "title" | "topic" | "preview" | "unread">>) {
  const t = getThread(id);
  if (!t) return null;
  const next = { ...t, ...patch };
  db.query("UPDATE threads SET title = ?, topic = ?, preview = ?, unread = ?, updated_at = ? WHERE id = ?").run(
    next.title,
    next.topic,
    next.preview,
    next.unread,
    patch.preview !== undefined ? now() : t.updatedAt,
    id,
  );
  return getThread(id);
}
export function addMember(threadId: string, botId: string) {
  const pos = (db.query("SELECT COUNT(*) AS n FROM thread_members WHERE thread_id = ?").get(threadId) as { n: number }).n;
  db.query("INSERT OR IGNORE INTO thread_members (thread_id, bot_id, position) VALUES (?, ?, ?)").run(threadId, botId, pos);
}
export function deleteThread(id: string, origin: EventOrigin = { actor: "system" }) {
  db.transaction(() => {
    const row = db.query("SELECT kind FROM threads WHERE id = ?").get(id) as { kind: ThreadKind } | null;
    if (!row) return;
    db.query("DELETE FROM threads WHERE id = ?").run(id);
    logEvent({ type: "thread.delete", threadId: id, threadKind: row.kind, ...origin });
  })();
}
/** The 1:1 thread between two bots that holds their private conversation. */
export function findBackchannel(a: string, b: string): Thread | null {
  const row = db
    .query(
      `SELECT t.id FROM threads t
       WHERE t.kind = 'backchannel'
         AND EXISTS (SELECT 1 FROM thread_members WHERE thread_id = t.id AND bot_id = ?)
         AND EXISTS (SELECT 1 FROM thread_members WHERE thread_id = t.id AND bot_id = ?)
       LIMIT 1`,
    )
    .get(a, b) as { id: string } | null;
  return row ? getThread(row.id) : null;
}

export function getMember(threadId: string, botId: string) {
  return db
    .query("SELECT session_id, last_seen_seq FROM thread_members WHERE thread_id = ? AND bot_id = ?")
    .get(threadId, botId) as { session_id: string | null; last_seen_seq: number } | null;
}
export function setMemberSession(threadId: string, botId: string, sessionId: string | null, lastSeenSeq: number) {
  db.query("UPDATE thread_members SET session_id = ?, last_seen_seq = ? WHERE thread_id = ? AND bot_id = ?").run(
    sessionId,
    lastSeenSeq,
    threadId,
    botId,
  );
}
export function resetSessionsForBot(botId: string) {
  db.query("UPDATE thread_members SET session_id = NULL, last_seen_seq = 0 WHERE bot_id = ?").run(botId);
}

type MessageRow = {
  id: string; thread_id: string; seq: number; author: string; bot_id: string | null; from_bot_id: string | null;
  parts: string; status: string; created_at: number;
};
const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  threadId: r.thread_id,
  seq: r.seq,
  author: r.author as Message["author"],
  botId: r.bot_id,
  fromBotId: r.from_bot_id,
  parts: JSON.parse(r.parts),
  status: r.status as Message["status"],
  createdAt: r.created_at,
});

export function listMessages(threadId: string, afterSeq = 0): Message[] {
  return (
    db.query("SELECT * FROM messages WHERE thread_id = ? AND seq > ? ORDER BY seq").all(threadId, afterSeq) as MessageRow[]
  ).map(toMessage);
}
export function pageMessages(threadId: string, afterSeq: number, limit: number): Message[] {
  return (
    db
      .query("SELECT * FROM messages WHERE thread_id = ? AND seq > ? ORDER BY seq LIMIT ?")
      .all(threadId, afterSeq, limit) as MessageRow[]
  ).map(toMessage);
}
export function getMessage(id: string): Message | null {
  const r = db.query("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow | null;
  return r ? toMessage(r) : null;
}
export function addMessage(m: {
  threadId: string;
  author: Message["author"];
  botId?: string | null;
  fromBotId?: string | null;
  parts: MessagePart[];
  status?: Message["status"];
}): Message {
  const id = newId();
  const seq =
    ((db.query("SELECT MAX(seq) AS s FROM messages WHERE thread_id = ?").get(m.threadId) as { s: number | null }).s ?? 0) + 1;
  db.query(
    "INSERT INTO messages (id, thread_id, seq, author, bot_id, from_bot_id, parts, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, m.threadId, seq, m.author, m.botId ?? null, m.fromBotId ?? null, JSON.stringify(m.parts), m.status ?? "done", now());
  return getMessage(id)!;
}
export function updateMessage(id: string, parts: MessagePart[], status?: Message["status"]) {
  if (status) db.query("UPDATE messages SET parts = ?, status = ? WHERE id = ?").run(JSON.stringify(parts), status, id);
  else db.query("UPDATE messages SET parts = ? WHERE id = ?").run(JSON.stringify(parts), id);
  return getMessage(id)!;
}
export function deleteMessage(id: string) {
  db.query("DELETE FROM messages WHERE id = ?").run(id);
}
/** Messages left "streaming" by a crash or restart. Their approval prompts died with the turn. */
export function closeDanglingMessages() {
  const rows = db.query("SELECT * FROM messages WHERE status = 'streaming'").all() as MessageRow[];
  for (const m of rows.map(toMessage)) {
    const kind = getThread(m.threadId)?.kind ?? null;
    for (const p of m.parts)
      if (p.type === "approval" && !p.decision)
        logEvent({ type: "approval.decision", actor: "system", threadId: m.threadId, threadKind: kind, approvalId: p.requestId, outcome: "cancelled" });
    const parts = m.parts.map((p) => (p.type === "approval" && !p.decision ? { ...p, decision: "deny" as const } : p));
    updateMessage(m.id, parts, "error");
  }
}

type RoutineRow = {
  id: string; bot_id: string; name: string; cron: string; prompt: string; thread_id: string | null;
  enabled: number; last_run_at: number | null;
};
const toRoutine = (r: RoutineRow): Routine => ({
  id: r.id,
  botId: r.bot_id,
  name: r.name,
  cron: r.cron,
  prompt: r.prompt,
  threadId: r.thread_id,
  enabled: !!r.enabled,
  lastRunAt: r.last_run_at,
  nextRunAt: null,
});
export function listRoutines(botId?: string): Routine[] {
  const rows = botId
    ? db.query("SELECT * FROM routines WHERE bot_id = ?").all(botId)
    : db.query("SELECT * FROM routines").all();
  return (rows as RoutineRow[]).map(toRoutine);
}
export function getRoutine(id: string): Routine | null {
  const r = db.query("SELECT * FROM routines WHERE id = ?").get(id) as RoutineRow | null;
  return r ? toRoutine(r) : null;
}
export function saveRoutine(r: Omit<Routine, "nextRunAt" | "lastRunAt"> & { lastRunAt?: number | null }): Routine {
  db.query(
    `INSERT INTO routines (id, bot_id, name, cron, prompt, thread_id, enabled, last_run_at)
     VALUES ($id, $botId, $name, $cron, $prompt, $threadId, $enabled, $lastRunAt)
     ON CONFLICT(id) DO UPDATE SET name=$name, cron=$cron, prompt=$prompt, thread_id=$threadId, enabled=$enabled`,
  ).run({
    $id: r.id,
    $botId: r.botId,
    $name: r.name,
    $cron: r.cron,
    $prompt: r.prompt,
    $threadId: r.threadId,
    $enabled: r.enabled ? 1 : 0,
    $lastRunAt: r.lastRunAt ?? null,
  });
  return getRoutine(r.id)!;
}
export function markRoutineRun(id: string, threadId: string) {
  db.query("UPDATE routines SET last_run_at = ?, thread_id = ? WHERE id = ?").run(now(), threadId, id);
}
export function deleteRoutine(id: string) {
  db.query("DELETE FROM routines WHERE id = ?").run(id);
}

type ConnectorRow = {
  id: string; name: string; preset: string; kind: string; command: string; args: string; env: string;
  url: string; headers: string; created_at: number;
};
const toConnector = (r: ConnectorRow): Connector => ({
  id: r.id,
  name: r.name,
  preset: r.preset,
  kind: r.kind as Connector["kind"],
  command: r.command,
  args: JSON.parse(r.args),
  env: JSON.parse(r.env),
  url: r.url,
  headers: JSON.parse(r.headers),
  createdAt: r.created_at,
});
export function listConnectors(): Connector[] {
  return (db.query("SELECT * FROM connectors ORDER BY created_at").all() as ConnectorRow[]).map(toConnector);
}
export function saveConnector(c: Omit<Connector, "createdAt">): Connector {
  db.query(
    `INSERT INTO connectors (id, name, preset, kind, command, args, env, url, headers, created_at)
     VALUES ($id, $name, $preset, $kind, $command, $args, $env, $url, $headers, $createdAt)
     ON CONFLICT(id) DO UPDATE SET name=$name, preset=$preset, kind=$kind, command=$command, args=$args, env=$env,
       url=$url, headers=$headers`,
  ).run({
    $id: c.id,
    $name: c.name,
    $preset: c.preset,
    $kind: c.kind,
    $command: c.command,
    $args: JSON.stringify(c.args),
    $env: JSON.stringify(c.env),
    $url: c.url,
    $headers: JSON.stringify(c.headers),
    $createdAt: now(),
  });
  return listConnectors().find((x) => x.id === c.id)!;
}
export function deleteConnector(id: string) {
  db.query("DELETE FROM connectors WHERE id = ?").run(id);
}

export type ThreadWebhook = { threadId: string; url: string; secret: string; header: string; encoding: WebhookEncoding; prefix: string };
type WebhookRow = { thread_id: string; url: string; secret: string; header: string; encoding: string; prefix: string };

export function getWebhook(threadId: string): ThreadWebhook | null {
  const r = db.query("SELECT * FROM thread_webhooks WHERE thread_id = ?").get(threadId) as WebhookRow | null;
  if (!r) return null;
  return { threadId: r.thread_id, url: r.url, secret: r.secret, header: r.header, encoding: r.encoding === "base64" ? "base64" : "hex", prefix: r.prefix };
}
export function saveWebhook(w: ThreadWebhook) {
  db.query(
    `INSERT INTO thread_webhooks (thread_id, url, secret, header, encoding, prefix, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(thread_id) DO UPDATE SET url = excluded.url, secret = excluded.secret, header = excluded.header,
       encoding = excluded.encoding, prefix = excluded.prefix, updated_at = excluded.updated_at`,
  ).run(w.threadId, w.url, w.secret, w.header, w.encoding, w.prefix, now());
}
export function deleteWebhook(threadId: string) {
  db.query("DELETE FROM thread_webhooks WHERE thread_id = ?").run(threadId);
}
export function webhookSent(threadId: string, requestId: string): boolean {
  return !!db
    .query(
      `SELECT 1 FROM messages m, json_each(m.parts) p
       WHERE m.thread_id = ? AND json_extract(p.value, '$.type') = 'webhook' AND json_extract(p.value, '$.requestId') = ?
       LIMIT 1`,
    )
    .get(threadId, requestId);
}

export type FileRow = {
  id: string; thread_id: string | null; bot_id: string | null; path: string; name: string; size: number; created_at: number;
};
export function addFile(f: Omit<FileRow, "id" | "created_at">): FileRow {
  const id = newId();
  db.query("INSERT INTO files (id, thread_id, bot_id, path, name, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    id,
    f.thread_id,
    f.bot_id,
    f.path,
    f.name,
    f.size,
    now(),
  );
  return db.query("SELECT * FROM files WHERE id = ?").get(id) as FileRow;
}
export function getFile(id: string): FileRow | null {
  return db.query("SELECT * FROM files WHERE id = ?").get(id) as FileRow | null;
}

export const TOOL_NAMES = [
  "list_bots", "message_bot", "ask_user", "share_file", "set_status", "set_topic", "notify_user", "list_threads",
  "read_thread", "schedule_routine", "list_routines", "delete_routine", "start_group", "invite_bot", "approve",
  "screen_open", "screen_read", "screen_click", "screen_type", "screen_press", "screen_scroll", "screen_wait", "screen_close",
  "screen_hand_over", "send_webhook", "setup_webhook",
] as const;
export const EVENT_RETENTION_MS = 30 * 24 * 60 * 60_000;
const EVENT_PAGE_MAX = 500;

export type EventActor = "api" | "bot" | "scheduler" | "system";
export type EventOutcome = "rejected" | "denied" | "approved" | "bypassed" | "succeeded" | "error" | "cancelled";
export type EventOrigin = { actor: EventActor; turnId?: string | null; callId?: string | null };
export type TrailEvent = EventOrigin & {
  type: "tool.call" | "tool.result" | "approval.request" | "approval.decision" | "thread.create" | "thread.delete";
  threadId: string | null;
  threadKind: ThreadKind | null;
  approvalId?: string | null;
  toolName?: string | null;
  outcome?: EventOutcome | null;
};

export function logEvent(e: TrailEvent) {
  const toolName = (TOOL_NAMES as readonly string[]).includes(e.toolName ?? "") ? (e.toolName ?? null) : null;
  db.query(
    `INSERT INTO events (created_at, event_type, thread_id, thread_kind, actor_category, turn_id, call_id, approval_id, tool_name, outcome_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(now(), e.type, e.threadId, e.threadKind, e.actor, e.turnId ?? null, e.callId ?? null, e.approvalId ?? null, toolName, e.outcome ?? null);
}

export function pruneEvents() {
  db.query("DELETE FROM events WHERE created_at < ?").run(now() - EVENT_RETENTION_MS);
}

export function listEvents(threadId: string, afterId: number, limit: number) {
  return db
    .query(
      `SELECT id, created_at AS createdAt, event_type AS type, thread_id AS threadId, thread_kind AS threadKind,
         actor_category AS actor, turn_id AS turnId, call_id AS callId, approval_id AS approvalId, tool_name AS toolName,
         outcome_code AS outcome
       FROM events
       WHERE (thread_id = ? OR call_id IN (SELECT call_id FROM events WHERE thread_id = ? AND call_id IS NOT NULL))
         AND id > ? AND created_at >= ?
       ORDER BY id LIMIT ?`,
    )
    .all(threadId, threadId, afterId, now() - EVENT_RETENTION_MS, Math.min(Math.max(limit, 1), EVENT_PAGE_MAX));
}
