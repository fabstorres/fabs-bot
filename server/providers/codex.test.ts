import { expect, test } from "bun:test";
import { readableError, toolOutcome } from "./codex";

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
