import { expect, test } from "bun:test";
import { codexMcpServers, readableError, toolOutcome } from "./codex";

test("unwraps the backend error body Codex passes through as the message", () => {
  const message = "The 'gpt-6-sol' model is not supported when using Codex with a ChatGPT account.";
  const body = JSON.stringify({ detail: message, error: { type: "invalid_request_error", code: "model_not_found", message } });
  expect(readableError(body)).toBe(message);
});

test("a failed MCP call carries the tool's own rejection text, which Codex puts in result rather than error", () => {
  const item = {
    type: "mcp_tool_call",
    server: "fabsbot",
    tool: "start_group",
    arguments: { title: "x" },
    result: { content: [{ type: "text", text: "Write a kickoff: the context and who owns what." }], structured_content: null },
    error: null,
    status: "failed",
  };
  expect(toolOutcome(item)).toEqual({ error: true, summary: "Write a kickoff: the context and who owns what." });
});

test("codex mcp list reports enabled and auth separately, so a switched-off server reads as disabled even when it is also signed out", () => {
  const list = [
    { name: "linear", enabled: false, transport: { type: "streamable_http", url: "https://mcp.linear.app/mcp" }, auth_status: "not_logged_in" },
    { name: "notion", enabled: true, transport: { type: "streamable_http", url: "https://mcp.notion.com/mcp" }, auth_status: "not_logged_in" },
    { name: "repl", enabled: true, transport: { type: "stdio", command: "node_repl" }, auth_status: "unsupported" },
  ];
  expect(codexMcpServers(list)).toEqual([
    { name: "linear", status: "disabled", kind: "http", source: "codex" },
    { name: "notion", status: "needs-auth", kind: "http", source: "codex" },
    { name: "repl", status: "enabled", kind: "stdio", source: "codex" },
  ]);
});
