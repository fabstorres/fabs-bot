import { childEnv, clip, parseJson, spawnLines, summarizeToolInput, which } from "./spawn";
import type { Launch, Provider } from "./types";

/** Codex `-c key=value` values are parsed as TOML; JSON strings are valid TOML basic strings. */
const toml = (v: unknown) => JSON.stringify(v);

const DEFAULT_MODEL = "gpt-6.1-sol";

export const codex: Provider = {
  id: "codex",
  label: "Codex",
  bin: "codex",
  supportsTools: true,
  resumable: true,
  note: "\"Ask\" autonomy runs Codex sandboxed to its workspace (Codex can't relay approvals headlessly).",
  models: ["", "gpt-5.5", "gpt-5.5-codex", "gpt-5.4-mini"],

  async run(o, emit) {
    const model = o.bot.model || (await accountDefaultModel(o.launch, o.signal));
    const cfg: string[] = [
      `mcp_servers.fabsbot.url=${toml(o.mcpUrl)}`,
      "mcp_servers.fabsbot.tool_timeout_sec=3600",
      `developer_instructions=${toml(o.systemPrompt)}`,
    ];
    for (const c of o.connectors) {
      const key = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      if (c.kind === "http") {
        cfg.push(`mcp_servers.${key}.url=${toml(c.url)}`);
        if (Object.keys(c.headers).length) cfg.push(`mcp_servers.${key}.http_headers=${tomlTable(c.headers)}`);
      } else {
        cfg.push(`mcp_servers.${key}.command=${toml(c.command)}`, `mcp_servers.${key}.args=${toml(c.args)}`);
        if (Object.keys(c.env).length) cfg.push(`mcp_servers.${key}.env=${tomlTable(c.env)}`);
      }
    }
    if (o.bot.autonomy === "ask") cfg.push(`sandbox_mode="workspace-write"`, `approval_policy="never"`);
    if (o.addDirs.length) cfg.push(`sandbox_workspace_write.writable_roots=${toml(o.addDirs)}`);

    const cmd = [o.launch.bin, "exec", ...o.launch.args];
    if (o.sessionId) cmd.push("resume", o.sessionId);
    cmd.push("--json", "--skip-git-repo-check");
    for (const c of cfg) cmd.push("-c", c);
    cmd.push("-m", model);
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
              const error = it.status === "failed" || (typeof it.exit_code === "number" && it.exit_code !== 0);
              emit({ type: "tool.end", id: it.id, error });
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

async function accountDefaultModel(launch: Launch, signal: AbortSignal): Promise<string> {
  const bin = which(launch.bin);
  if (!bin) return DEFAULT_MODEL;
  const proc = Bun.spawn([bin, "app-server"], {
    env: { ...childEnv, ...launch.env },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
    timeout: 10_000,
    signal,
  });
  const requests = [
    { id: 1, method: "initialize", params: { clientInfo: { name: "fabs_bot", title: "Fabs Bot", version: "1" } } },
    { method: "initialized" },
    { id: 2, method: "model/list", params: {} },
  ];
  try {
    proc.stdin.write(requests.map((r) => `${JSON.stringify(r)}\n`).join(""));
    proc.stdin.flush();
    const decoder = new TextDecoder();
    let out = "";
    for await (const chunk of proc.stdout) {
      out += decoder.decode(chunk, { stream: true });
      const reply = out.split("\n").map(parseJson).find((r) => r?.id === 2);
      if (reply) return reply.result?.data?.find((m: any) => m.isDefault)?.model ?? DEFAULT_MODEL;
    }
  } catch {
  } finally {
    proc.kill();
  }
  return DEFAULT_MODEL;
}

export function readableError(message: string): string {
  const body = parseJson(message);
  const text = body?.error?.message ?? body?.detail;
  return typeof text === "string" ? text : message;
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
