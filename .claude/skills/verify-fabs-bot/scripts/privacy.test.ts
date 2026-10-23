import { expect, test } from "bun:test";
import { hostname } from "node:os";
import { redact, risky } from "./privacy.mjs";

test("redacted output passes the privacy scan", () => {
  expect(risky(redact("https://pc.tail1234.ts.net/pair?token=abcdefghijkl"))).toBe(false);
});

test("Tailscale IPv6 addresses are caught and redacted", () => {
  expect(risky("fd7a:115c:a1e0:abcd::1234")).toBe(true);
  expect(risky(redact("fd7a:115c:a1e0:abcd::1234"))).toBe(false);
});

test("this PC's own name is caught and redacted, since the app shows it when the server is offline", () => {
  const banner = `${hostname().split(".")[0]} is reconnecting`;
  expect(risky(banner)).toBe(true);
  expect(redact(banner)).toBe("<pc> is reconnecting");
});
