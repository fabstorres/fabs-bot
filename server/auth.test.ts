import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "fabs-auth-test-"));
process.env.FABS_DATA_DIR = join(scratch, "data");
process.env.FABS_WORK_ROOT = join(scratch, "work");
const { authorized } = await import("./auth");

const fromLoopback = (host?: string) =>
  authorized(new Request("http://127.0.0.1/api/host", { headers: host ? { host } : {} }), "127.0.0.1");

test("loopback trust accepts loopback Host names on any port, in any case", () => {
  for (const host of ["127.0.0.1:4800", "127.0.0.1", "localhost:5173", "LocalHost:4800", "[::1]:4800", "[::1]"])
    expect(fromLoopback(host)).toBe(true);
});

test("loopback trust refuses rebound and look-alike Host names", () => {
  for (const host of ["evil.example:4800", "localhost.evil.com:4800", "127.0.0.1.evil.com", "evil.localhost:4800", "::1", undefined])
    expect(fromLoopback(host)).toBe(false);
});

test("a Tailscale login header never stands in for pairing, even with a loopback Host", () => {
  const headers = { host: "127.0.0.1:4800", "tailscale-user-login": "owner@example.com" };
  for (const viaServe of [false, true])
    expect(authorized(new Request("http://127.0.0.1/api/host", { headers }), "127.0.0.1", viaServe)).toBe(false);
});
