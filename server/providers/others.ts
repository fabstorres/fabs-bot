// Best-effort adapters for CLIs that can't take our MCP tools per-run.
// These bots still chat, work in their workspace, and join group threads via @mentions.
import { clip, parseJson, spawnLines, summarizeToolInput } from "./spawn";
import type { Provider, RunOptions } from "./types";

/** Without a system-prompt flag, the persona rides along in the first prompt. */
function withPersona(o: RunOptions) {
  return o.sessionId ? o.prompt : `<instructions>\n${o.systemPrompt}\n</instructions>\n\n${o.prompt}`;
}

export const cursor: Provider = {
  id: "cursor",
  label: "Cursor Agent",
  bin: "cursor-agent",
  supportsTools: false,
  resumable: true,
  note: "Needs `cursor-agent login` once. App tools (messaging bots, files) aren't wired in yet.",
  models: ["", "auto", "sonnet-4.5", "gpt-5"],

  async run(o, emit) {
    const cmd = ["cursor-agent", "-p", "--output-format", "stream-json", "--trust", "--workspace", o.cwd];
    if (o.bot.autonomy === "full") cmd.push("--force", "--approve-mcps");
    if (o.bot.model) cmd.push("--model", o.bot.model);
    if (o.sessionId) cmd.push("--resume", o.sessionId);
    cmd.push(withPersona(o));
    let done = false;
    const { code, stderr } = await spawnLines({
      cmd,
      cwd: o.cwd,
      signal: o.signal,
      onLine(line) {
        const ev = parseJson(line);
        if (!ev) return;
        if (ev.session_id && ev.type === "system") emit({ type: "session", id: ev.session_id });
        if (ev.type === "assistant") {
          const text = (ev.message?.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
          if (text) {
            emit({ type: "text.break" });
            emit({ type: "text", text });
          }
        }
        if (ev.type === "tool_call") {
          const call = ev.tool_call ?? {};
          const key = Object.keys(call)[0] ?? "tool";
          const name = key.replace(/ToolCall$/, "");
          if (ev.subtype === "started") emit({ type: "tool.start", id: ev.call_id, name, summary: summarizeToolInput(name, call[key]?.args) });
          else emit({ type: "tool.end", id: ev.call_id });
        }
        if (ev.type === "result") {
          done = true;
          if (ev.session_id) emit({ type: "session", id: ev.session_id });
          if (ev.is_error) emit({ type: "error", message: String(ev.result ?? "Cursor error") });
          emit({ type: "done" });
        }
      },
    });
    if (!done) {
      emit({ type: "error", message: stderr.trim() || `cursor-agent exited with code ${code}` });
      emit({ type: "done" });
    }
  },
};

export const opencode: Provider = {
  id: "opencode",
  label: "OpenCode",
  bin: "opencode",
  supportsTools: false,
  resumable: true,
  note: "Model format is provider/model. App tools aren't wired in yet.",
  models: ["", "anthropic/claude-sonnet-5-5", "openai/gpt-5.5"],

  async run(o, emit) {
    const cmd = ["opencode", "run", "--format", "json", "--dir", o.cwd];
    if (o.bot.autonomy === "full") cmd.push("--dangerously-skip-permissions");
    if (o.bot.model) cmd.push("-m", o.bot.model);
    if (o.sessionId) cmd.push("-s", o.sessionId);
    cmd.push(withPersona(o));
    let sawSession = false;
    let failed = false;
    const { code, stderr } = await spawnLines({
      cmd,
      cwd: o.cwd,
      signal: o.signal,
      onLine(line) {
        const ev = parseJson(line);
        if (!ev) return;
        if (ev.sessionID && !sawSession) {
          sawSession = true;
          emit({ type: "session", id: ev.sessionID });
        }
        const part = ev.part ?? {};
        if (ev.type === "text" && part.text) {
          emit({ type: "text.break" });
          emit({ type: "text", text: part.text });
        } else if (ev.type === "tool_use") {
          const id = part.callID ?? part.id ?? crypto.randomUUID();
          emit({ type: "tool.start", id, name: part.tool ?? "tool", summary: summarizeToolInput(part.tool, part.state?.input) });
          if (part.state?.status === "completed" || part.state?.status === "error")
            emit({ type: "tool.end", id, error: part.state.status === "error" });
        } else if (ev.type === "error") {
          failed = true;
          emit({ type: "error", message: clip(ev.error?.data?.message ?? ev.error?.name ?? "OpenCode error", 400) });
        }
      },
    });
    if (code !== 0 && !failed) emit({ type: "error", message: stderr.trim() || `opencode exited with code ${code}` });
    emit({ type: "done" });
  },
};

export const gemini: Provider = {
  id: "gemini",
  label: "Gemini CLI",
  bin: "gemini",
  supportsTools: false,
  resumable: false,
  note: "Plain-text mode: no session resume, so each turn re-sends the thread.",
  models: ["", "gemini-2.5-pro", "gemini-2.5-flash"],

  async run(o, emit) {
    const cmd = ["gemini"];
    if (o.bot.autonomy === "full") cmd.push("-y");
    if (o.bot.model) cmd.push("-m", o.bot.model);
    emit({ type: "text.break" });
    const { code, stderr } = await spawnLines({
      cmd,
      cwd: o.cwd,
      stdin: withPersona({ ...o, sessionId: null }),
      signal: o.signal,
      onLine: (line) => emit({ type: "text", text: line + "\n" }),
    });
    if (code !== 0) emit({ type: "error", message: stderr.trim() || `gemini exited with code ${code}` });
    emit({ type: "done" });
  },
};
