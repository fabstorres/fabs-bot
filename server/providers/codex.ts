import { clip, parseJson, spawnLines, summarizeToolInput } from "./spawn";
import { serverKey, type Launch, type Provider, type RunConnector } from "./types";
import type { InheritedServer } from "./claude";

/** Codex `-c key=value` values are parsed as TOML; JSON strings are valid TOML basic strings. */
const toml = (v: unknown) => JSON.stringify(v);

export const codex: Provider = {
  id: "codex",
  label: "Codex",
  bin: "codex",
  supportsTools: true,
  resumable: true,
  note: "\"Ask\" autonomy runs Codex sandboxed to its workspace (Codex can't relay approvals headlessly).",
  models: [
    { id: "gpt-6.1-sol", name: "GPT-6.1 Sol" },
    { id: "gpt-6-astra", name: "GPT-6 Astra" },
    { id: "gpt-6-luna", name: "GPT-6 Luna" },
    { id: "gpt-6-sol", name: "GPT-6 Sol", legacy: true },
    { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", legacy: true },
    { id: "gpt-5.6-terra", name: "GPT-5.6 Terra", legacy: true },
    { id: "gpt-5.6-luna", name: "GPT-5.6 Luna", legacy: true },
    { id: "gpt-5.5", name: "GPT-5.5", legacy: true },
    { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", legacy: true },
    { id: "gpt-5.3-codex-spark", name: "GPT-5.3 Codex Spark", legacy: true },
  ],

  async run(o, emit) {
    const cfg: string[] = [
      `mcp_servers.fabsbot.url=${toml(o.mcpUrl)}`,
      "mcp_servers.fabsbot.tool_timeout_sec=3600",
      `developer_instructions=${toml(o.systemPrompt)}`,
    ];
    cfg.push(...connectorConfig(o.connectors));
    if (o.bot.autonomy === "ask") cfg.push(`sandbox_mode="workspace-write"`, `approval_policy="never"`);
    if (o.addDirs.length) cfg.push(`sandbox_workspace_write.writable_roots=${toml(o.addDirs)}`);

    const cmd = [o.launch.bin, "exec", ...o.launch.args];
    if (o.sessionId) cmd.push("resume", o.sessionId);
    cmd.push("--json", "--skip-git-repo-check");
    for (const c of cfg) cmd.push("-c", c);
    if (o.bot.model) cmd.push("-m", o.bot.model);
    if (o.bot.autonomy === "full") cmd.push("--dangerously-bypass-approvals-and-sandbox");
    cmd.push("-");

    let finished = false;
    let failed = false;
    const { code, stderr } = await spawnLines({
      cmd,
      cwd: o.cwd,
      env: o.launch.env,
      stdin: o.prompt,
      signal: o.signal,
      onLine(line) {
        const ev = parseJson(line);
        if (!ev) return;
        switch (ev.type) {
          case "thread.started":
            emit({ type: "session", id: ev.thread_id });
            break;
          case "item.started":
          case "item.updated":
          case "item.completed": {
            const it = ev.item ?? {};
            const done = ev.type === "item.completed";
            if (it.type === "agent_message") {
              if (done && it.text) {
                emit({ type: "text.break" });
                emit({ type: "text", text: it.text });
              }
              break;
            }
            const tool = describeItem(it);
            if (!tool) break;
            if (ev.type === "item.started") emit({ type: "tool.start", id: it.id, ...tool });
            else if (done) {
              emit({ type: "tool.start", id: it.id, ...tool });
              emit({ type: "tool.end", id: it.id, ...toolOutcome(it) });
            }
            break;
          }
          case "turn.completed":
            finished = true;
            emit({ type: "done" });
            break;
          case "turn.failed":
            failed = true;
            emit({ type: "error", message: readableError(ev.error?.message ?? "Codex turn failed") });
            break;
          case "error":
            failed = true;
            emit({ type: "error", message: readableError(ev.message ?? "Codex error") });
            break;
        }
      },
    });
    if (!finished) {
      if (!failed) emit({ type: "error", message: o.signal.aborted ? "Stopped." : stderr.trim() || `codex exited with code ${code}` });
      emit({ type: "done" });
    }
  },
};

export function readableError(message: string): string {
  const body = parseJson(message);
  const text = body?.error?.message ?? body?.detail;
  return typeof text === "string" ? text : message;
}

export function toolOutcome(it: any): { error: boolean; summary?: string } {
  const error = it.status === "failed" || (typeof it.exit_code === "number" && it.exit_code !== 0);
  if (!error || it.type !== "mcp_tool_call") return { error };
  const text = it.error?.message ?? it.result?.content?.find((c: any) => c?.type === "text")?.text;
  return { error, summary: typeof text === "string" ? text : undefined };
}

function connectorConfig(connectors: RunConnector[]) {
  const cfg: string[] = [];
  for (const c of connectors) {
    const key = serverKey(c);
    if (c.kind === "http") {
      cfg.push(`mcp_servers.${key}.url=${toml(c.url)}`);
      if (Object.keys(c.headers).length) cfg.push(`mcp_servers.${key}.http_headers=${tomlTable(c.headers)}`);
      if (c.tokenEnv) cfg.push(`mcp_servers.${key}.bearer_token_env_var=${toml(c.tokenEnv)}`);
    } else {
      cfg.push(`mcp_servers.${key}.command=${toml(c.command)}`, `mcp_servers.${key}.args=${toml(c.args)}`);
      if (Object.keys(c.env).length) cfg.push(`mcp_servers.${key}.env=${tomlTable(c.env)}`);
    }
  }
  return cfg;
}

function tomlTable(obj: Record<string, string>) {
  return `{ ${Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)} = ${JSON.stringify(v)}`).join(", ")} }`;
}

function describeItem(it: any): { name: string; summary: string } | null {
  switch (it.type) {
    case "command_execution":
      return { name: "Shell", summary: clip(String(it.command ?? "")) };
    case "file_change":
      return {
        name: "Edit",
        summary: clip((it.changes ?? []).map((c: any) => `${c.kind ?? ""} ${c.path}`).join(", ")),
      };
    case "mcp_tool_call":
      return { name: `${it.server} · ${it.tool}`, summary: summarizeToolInput(it.tool, it.arguments) };
    case "web_search":
      return { name: "Web search", summary: clip(String(it.query ?? "")) };
    case "todo_list":
      return { name: "Plan", summary: clip((it.items ?? []).map((t: any) => t.text).join(" · ")) };
    default:
      return null;
  }
}

const CODEX_TRANSPORT: Record<string, InheritedServer["kind"]> = { stdio: "stdio", streamable_http: "http" };

export function codexMcpServers(list: unknown): InheritedServer[] {
  if (!Array.isArray(list)) return [];
  return list.map((s) => ({
    name: String(s.name),
    status: s.enabled === false ? "disabled" : s.auth_status === "not_logged_in" ? "needs-auth" : "enabled",
    kind: CODEX_TRANSPORT[s.transport?.type],
    source: "codex",
  }));
}

export async function scanCodexInventory(cwd: string, launch: Launch): Promise<InheritedServer[]> {
  const ctrl = new AbortController();
  const lines: string[] = [];
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const { code } = await spawnLines({
      cmd: [launch.bin, ...launch.args, "mcp", "list", "--json"],
      cwd,
      env: launch.env,
      signal: ctrl.signal,
      onLine: (line) => lines.push(line),
    });
    if (code !== 0) return [];
  } finally {
    clearTimeout(timer);
  }
  return codexMcpServers(parseJson(lines.join("\n")));
}
