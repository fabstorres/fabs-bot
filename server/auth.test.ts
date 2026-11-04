import { afterEach, expect, setSystemTime, test } from "bun:test";
import { chmodSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "fabs-auth-test-"));
process.env.FABS_DATA_DIR = join(scratch, "data");
process.env.FABS_WORK_ROOT = join(scratch, "work");
const { authorized, listDevices, newPairingCode, pairDevice, redeemPairingCode, removeDevice } = await import("./auth");
const { DATA_DIR } = await import("./config");

afterEach(() => setSystemTime());

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

const fromDevice = (token: string, how: "cookie" | "bearer") =>
  new Request("http://pc.example/api/host", { headers: how === "cookie" ? { cookie: `fabs_token=${token}` } : { authorization: `Bearer ${token}` } });

test("a pairing code works once", () => {
  const { code } = newPairingCode();
  expect(redeemPairingCode(code)).toBe(true);
  expect(redeemPairingCode(code)).toBe(false);
});

test("a pairing code stops working at exactly 5 minutes", () => {
  const start = Date.now();
  setSystemTime(start);
  const early = newPairingCode().code;
  const late = newPairingCode().code;
  setSystemTime(start + 5 * 60_000 - 1);
  expect(redeemPairingCode(early)).toBe(true);
  setSystemTime(start + 5 * 60_000);
  expect(redeemPairingCode(late)).toBe(false);
});

test("removing one device signs out only that device, by cookie and by bearer", () => {
  const kept = pairDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1");
  const removed = pairDevice("Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0 Safari/537.36");
  expect(removeDevice(listDevices(fromDevice(removed, "cookie")).find((d) => d.current)!.id)).toBe(true);
  for (const how of ["cookie", "bearer"] as const) {
    expect(authorized(fromDevice(removed, how), "192.0.2.10")).toBe(false);
    expect(authorized(fromDevice(kept, how), "192.0.2.10")).toBe(true);
  }
});

test("saving devices tightens a devices file that was left readable by others", () => {
  const file = join(DATA_DIR, "devices.json");
  pairDevice("Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0");
  chmodSync(file, 0o644);
  pairDevice("Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0");
  expect(statSync(file).mode & 0o777).toBe(0o600);
});
