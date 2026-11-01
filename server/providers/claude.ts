import type { Connector } from "../../shared/types";
import { parseJson, spawnLines, summarizeToolInput } from "./spawn";
import type { Launch, Provider } from "./types";

export function prettyToolName(name: string): string {
  const m = name.match(/^mcp__(.+?)__(.+)$/);
  if (!m) return name;
  const server = m[1]!.replace(/^claude_ai_/, "").replace(/_/g, " ");
  return `${server} · ${m[2]}`;
}

function mcpServers(mcpUrl: string, connectors: Connector[]) {
  const servers: Record<string, unknown> = { fabsbot: { type: "http", url: mcpUrl } };
  for (const c of connectors) {
    const key = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    servers[key] =
      c.kind === "http"
        ? { type: "http", url: c.url, headers: c.headers }
        : { type: "stdio", command: c.command, args: c.args, env: c.env };
  }
  return { mcpServers: servers };
}

/**
 * Claude Code built-ins that overlap with Fabs Bot's own team tools. A bot using these would talk to
 * session-local agents or schedule session-local crons that die with the run, so we hide them per run.
 */
const SHADOWED_TOOLS = ["SendMessage", "ListAgents", "CronCreate", "CronDelete", "CronList", "ScheduleWakeup", "PushNotification", "RemoteTrigger"];

/** Read-only tools a bot in "ask" mode may use without asking. */
const SAFE_TOOLS = ["Read", "Glob", "Grep", "LS", "WebSearch", "WebFetch", "TodoWrite", "mcp__fabsbot"];

export const claude: Provider = {
  id: "claude",
  label: "Claude Code",
  bin: "claude",
  supportsTools: true,
  resumable: true,
  note: "Inherits your Claude Code MCP servers and claude.ai connectors (Notion, Google Drive, …).",
  models: ["", "opus", "sonnet", "haiku", "claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"],

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
      env: { MCP_TOOL_TIMEOUT: "3600000", ...o.launch.env },
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
              if (block.type === "tool_result") emit({ type: "tool.end", id: block.tool_use_id, error: !!block.is_error });
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
}

/**
 * See which MCP servers / claude.ai connectors a Claude bot inherits from your own setup.
 * Starts claude and stops it as soon as it reports its init event, before any model call.
 */
export async function scanClaudeInventory(cwd: string, launch: Launch): Promise<InheritedServer[]> {
  const ctrl = new AbortController();
  let servers: InheritedServer[] = [];
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    await spawnLines({
      cmd: [launch.bin, ...launch.args, "-p", "--output-format", "stream-json", "--verbose", "--model", "haiku"],
      cwd,
      env: launch.env,
      stdin: "ok",
      signal: ctrl.signal,
      onLine(line) {
        const ev = parseJson(line);
        if (ev?.type === "system" && ev.subtype === "init") {
          servers = (ev.mcp_servers ?? []).map((s: any) => ({ name: String(s.name), status: String(s.status) }));
          ctrl.abort();
        }
      },
    });
  } finally {
    clearTimeout(timer);
  }
  return servers;
}
