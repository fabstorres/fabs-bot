import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Device } from "../shared/types";
import { DATA_DIR } from "./config";

const COOKIE = "fabs_token";
const CODE_LIFETIME_MS = 5 * 60_000;
const SEEN_EVERY_MS = 60_000;
const devicesFile = join(DATA_DIR, "devices.json");

type StoredDevice = Omit<Device, "current"> & { tokenHash: string };

const newSecret = () => randomBytes(24).toString("base64url");
const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

function loadDevices(): StoredDevice[] {
  try {
    return JSON.parse(readFileSync(devicesFile, "utf8"));
  } catch {
    return [];
  }
}

const codes = new Map<string, number>();
const devices = loadDevices();
function saveDevices() {
  writeFileSync(devicesFile, JSON.stringify(devices, null, 2), { mode: 0o600 });
  chmodSync(devicesFile, 0o600);
}

export function isLoopback(ip: string | undefined) {
  return !!ip && (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1");
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function loopbackHost(req: Request): boolean {
  const host = req.headers.get("host")?.toLowerCase().replace(/:\d+$/, "");
  return !!host && LOOPBACK_HOSTS.has(host);
}

function cookieToken(req: Request): string | null {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

export function deviceId(req: Request): string | null {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const presented = [cookieToken(req), bearer].filter((t): t is string => !!t).map(hash);
  const device = devices.find((d) => presented.includes(d.tokenHash));
  if (!device) return null;
  if (Date.now() - device.lastSeenAt > SEEN_EVERY_MS) {
    device.lastSeenAt = Date.now();
    saveDevices();
  }
  return device.id;
}

export function localOwner(req: Request, ip: string | undefined, viaServe = false): boolean {
  return isLoopback(ip) && !req.headers.get("tailscale-user-login") && !viaServe && loopbackHost(req);
}

export function authorized(req: Request, ip: string | undefined, viaServe = false): boolean {
  return localOwner(req, ip, viaServe) || deviceId(req) !== null;
}

/**
 * Browsers send Origin on cross-site writes and WebSocket upgrades; CLIs and proxies send none.
 * `tailscale serve` may rewrite Host, so its X-Forwarded-Host counts as our own host too.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  return [req.headers.get("host"), req.headers.get("x-forwarded-host")].includes(host);
}

export function newPairingCode() {
  const now = Date.now();
  for (const [key, expiresAt] of codes) if (expiresAt <= now) codes.delete(key);
  const code = newSecret();
  codes.set(hash(code), now + CODE_LIFETIME_MS);
  return { code, expiresAt: now + CODE_LIFETIME_MS };
}

export function redeemPairingCode(code: string): boolean {
  const key = hash(code);
  const expiresAt = codes.get(key);
  codes.delete(key);
  return expiresAt !== undefined && expiresAt > Date.now();
}

const BROWSERS: [RegExp, string][] = [
  [/Electron\//, "Desktop app"],
  [/Edg/, "Edge"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Macintosh/, "Mac"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
];

function deviceLabel(userAgent: string) {
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1] ?? "Browser";
  const system = SYSTEMS.find(([re]) => re.test(userAgent))?.[1];
  return system ? `${browser} on ${system}` : browser;
}

export function pairDevice(userAgent: string): string {
  const token = newSecret();
  const now = Date.now();
  devices.push({ id: randomUUID(), label: deviceLabel(userAgent), tokenHash: hash(token), createdAt: now, lastSeenAt: now });
  saveDevices();
  return token;
}

export function listDevices(req: Request): Device[] {
  const current = deviceId(req);
  return devices.map(({ id, label, createdAt, lastSeenAt }) => ({ id, label, createdAt, lastSeenAt, current: id === current }));
}

export function removeDevice(id: string): boolean {
  const index = devices.findIndex((d) => d.id === id);
  if (index < 0) return false;
  devices.splice(index, 1);
  saveDevices();
  return true;
}

export function pairCookie(token: string): string {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`;
}
