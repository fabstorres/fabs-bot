import { parseJson, spawnLines, summarizeToolInput } from "./spawn";
import { serverKey, type Launch, type Provider, type RunConnector } from "./types";

export function prettyToolName(name: string): string {
  const m = name.match(/^mcp__(.+?)__(.+)$/);
  if (!m) return name;
  const server = m[1]!.replace(/^claude_ai_/, "").replace(/_/g, " ");
  return `${server} · ${m[2]}`;
}

function connectorServers(connectors: RunConnector[]) {
  const servers: Record<string, unknown> = {};
  for (const c of connectors) {
    const headers = c.tokenEnv ? { ...c.headers, Authorization: `Bearer \${${c.tokenEnv}}` } : c.headers;
    servers[serverKey(c)] =
      c.kind === "http" ? { type: "http", url: c.url, headers } : { type: "stdio", command: c.command, args: c.args, env: c.env };
  }
  return servers;
}

function mcpServers(mcpUrl: string, connectors: RunConnector[]) {
  return { mcpServers: { fabsbot: { type: "http", url: mcpUrl, timeout: 3_600_000 }, ...connectorServers(connectors) } };
}

/**
 * Claude Code built-ins that overlap with Fabs Bot's own team tools. A bot using these would talk to
 * session-local agents or schedule session-local crons that die with the run, so we hide them per run.
 */
const SHADOWED_TOOLS = ["SendMessage", "ListAgents", "CronCreate", "CronDelete", "CronList", "ScheduleWakeup", "PushNotification", "RemoteTrigger"];

/** Read-only tools a bot in "ask" mode may use without asking. */
const SAFE_TOOLS = ["Read", "Glob", "Grep", "LS", "WebSearch", "WebFetch", "TodoWrite", "mcp__fabsbot"];

function resultText(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  return content.find((c) => c?.type === "text" && typeof c.text === "string")?.text;
}

export const claude: Provider = {
  id: "claude",
  label: "Claude Code",
  bin: "claude",
  supportsTools: true,
  resumable: true,
  note: "Inherits your Claude Code MCP servers and claude.ai connectors (Notion, Google Drive, …).",
  models: [
    { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
    { id: "claude-fable-5-1", name: "Claude Fable 5.1" },
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5" },
    { id: "claude-fable-5", name: "Claude Fable 5", legacy: true },
    { id: "claude-opus-5", name: "Claude Opus 5", legacy: true },
    { id: "claude-opus-4-8", name: "Claude Opus 4.8", legacy: true },
    { id: "claude-opus-4-7", name: "Claude Opus 4.7", legacy: true },
    { id: "claude-opus-4-6", name: "Claude Opus 4.6", legacy: true },
    { id: "claude-opus-4-5", name: "Claude Opus 4.5", legacy: true },
    { id: "claude-sonnet-5", name: "Claude Sonnet 5", legacy: true },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", legacy: true },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", legacy: true },
  ],

  async run(o, emit) {
    const cmd = [
      o.launch.bin,
      ...o.launch.args,
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--append-system-prompt",
      o.systemPrompt,
      "--mcp-config",
      JSON.stringify(mcpServers(o.mcpUrl, o.connectors)),
    ];
    cmd.push("--disallowedTools", ...SHADOWED_TOOLS);
    for (const d of o.addDirs) cmd.push("--add-dir", d);
    if (o.bot.model) cmd.push("--model", o.bot.model);
    if (o.sessionId) cmd.push("--resume", o.sessionId);
    if (o.bot.autonomy === "full") {
      cmd.push("--permission-mode", "bypassPermissions");
    } else {
      cmd.push("--permission-prompt-tool", "mcp__fabsbot__approve", "--allowedTools", ...SAFE_TOOLS);
    }

    let gotResult = false;
    const { code, stderr } = await spawnLines({
      cmd,
      cwd: o.cwd,
      env: o.launch.env,
      stdin: o.prompt,
      signal: o.signal,
      onLine(line) {
        const ev = parseJson(line);
        if (!ev) return;
        // Ignore what sub-agents (Task tool) say; we only show the bot's own voice.
        if (ev.parent_tool_use_id) return;
        switch (ev.type) {
          case "system":
            if (ev.subtype === "init" && ev.session_id) emit({ type: "session", id: ev.session_id });
            break;
          case "stream_event": {
            const e = ev.event;
            if (e?.type === "content_block_start" && e.content_block?.type === "text") emit({ type: "text.break" });
            if (e?.type === "content_block_delta" && e.delta?.type === "text_delta") emit({ type: "text", text: e.delta.text });
            break;
          }
          case "assistant":
            for (const block of ev.message?.content ?? []) {
              if (block.type === "tool_use") {
                if (block.name === "ToolSearch") continue; // Claude loading deferred tool schemas; noise to the user.
                emit({
                  type: "tool.start",
                  id: block.id,
                  name: prettyToolName(block.name),
                  summary: summarizeToolInput(block.name, block.input),
                });
              }
            }
            break;
          case "user":
            for (const block of ev.message?.content ?? []) {
              if (block.type === "tool_result") {
                const error = !!block.is_error;
                emit({ type: "tool.end", id: block.tool_use_id, error, summary: error ? resultText(block.content) : undefined });
              }
            }
            break;
          case "result":
            gotResult = true;
            if (ev.session_id) emit({ type: "session", id: ev.session_id });
            if (ev.is_error) emit({ type: "error", message: String(ev.result ?? ev.subtype) });
            emit({ type: "done", costUsd: ev.total_cost_usd });
            break;
        }
      },
    });
    if (!gotResult) {
      if (o.signal.aborted) emit({ type: "error", message: "Stopped." });
      else emit({ type: "error", message: stderr.trim() || `claude exited with code ${code}` });
      emit({ type: "done" });
    }
  },
};

export interface InheritedServer {
  name: string;
  status: string;
  kind?: "http" | "stdio";
  source: "claude" | "codex";
}

function mcpStatus(text: string) {
  if (/auth/i.test(text)) return "needs-auth";
  if (/fail/i.test(text)) return "failed";
  if (/connected/i.test(text)) return "connected";
  return text.replace(/^[^A-Za-z]+/, "").toLowerCase();
}

export async function scanClaudeInventory(cwd: string, launch: Launch): Promise<InheritedServer[]> {
  const ctrl = new AbortController();
  const servers: InheritedServer[] = [];
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    await spawnLines({
      cmd: [launch.bin, ...launch.args, "mcp", "list"],
      cwd,
      env: launch.env,
      signal: ctrl.signal,
      onLine(line) {
        const m = line.match(/^(.+?): (.+) - (.+)$/);
        if (m) servers.push({ name: m[1]!, status: mcpStatus(m[3]!), kind: /^https?:\/\//.test(m[2]!) ? "http" : "stdio", source: "claude" });
      },
    });
  } finally {
    clearTimeout(timer);
  }
  return servers;
}
