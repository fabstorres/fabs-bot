import { expect, test } from "bun:test";
import { readableError } from "./codex";

test("unwraps the backend error body Codex passes through as the message", () => {
  const message = "The 'gpt-6-sol' model is not supported when using Codex with a ChatGPT account.";
  const body = JSON.stringify({ detail: message, error: { type: "invalid_request_error", code: "model_not_found", message } });
  expect(readableError(body)).toBe(message);
});
