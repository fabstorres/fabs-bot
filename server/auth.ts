import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./config";

const tokenFile = join(DATA_DIR, "access-token");

/** Long-lived secret that pairs a phone/laptop with this PC. Rotate by deleting the file. */
export const ACCESS_TOKEN: string = (() => {
  if (existsSync(tokenFile)) return readFileSync(tokenFile, "utf8").trim();
  const t = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
  writeFileSync(tokenFile, t, { mode: 0o600 });
  return t;
})();

const COOKIE = "fabs_token";

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

export function authorized(req: Request, ip: string | undefined, ownerLogin: string | null, viaServe = false): boolean {
  const tsUser = req.headers.get("tailscale-user-login");
  if (isLoopback(ip)) {
    if (!tsUser && !viaServe && loopbackHost(req)) return true;
    if (ownerLogin && tsUser === ownerLogin) return true;
  }
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const query = new URL(req.url).searchParams.get("token");
  return [cookieToken(req), bearer, query].some((t) => t && timingSafeEqual(t, ACCESS_TOKEN));
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

export function pairCookie(): string {
  return `${COOKIE}=${encodeURIComponent(ACCESS_TOKEN)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
