import { expect, test } from "bun:test";
import { retryDelay } from "./store";

test("the first retry waits 1–2 s and no retry waits past the 5 min cap", () => {
  expect(retryDelay(0, 0)).toBe(1_000);
  expect(retryDelay(0, 1)).toBe(2_000);
  expect(retryDelay(7, 1)).toBe(256_000);
  expect(retryDelay(8, 0)).toBe(150_000);
  expect(retryDelay(8, 1)).toBe(300_000);
  expect(retryDelay(40, 1)).toBe(300_000);
});
