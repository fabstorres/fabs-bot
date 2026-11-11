import { createHmac } from "node:crypto";
import type { WebhookEncoding } from "../shared/types";
import { VERSION } from "./config";
import type { ThreadWebhook } from "./db";

export const WEBHOOK_TIMEOUT_MS = 10_000;
export const WEBHOOK_BODY_MAX = 1024 * 1024;

const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/;
const HEADER_PREFIX = /^[\x21-\x7e]{0,32}$/;
const RESERVED_HEADERS = ["content-type", "content-length", "host", "user-agent"];

export function isWebhookUrl(url: string): boolean {
  if (url.length > 2048 || !URL.canParse(url)) return false;
  const { protocol } = new URL(url);
  return protocol === "https:" || protocol === "http:";
}

export const isSignatureHeader = (name: string) => HEADER_NAME.test(name) && !RESERVED_HEADERS.includes(name.toLowerCase());
export const isSignaturePrefix = (prefix: string) => HEADER_PREFIX.test(prefix);

export function sign(secret: string, body: string, encoding: WebhookEncoding): string {
  return createHmac("sha256", secret).update(body).digest(encoding);
}

export type Delivery = { ok: boolean; detail: string };

export async function deliver(hook: ThreadWebhook, body: string, stop: AbortSignal): Promise<Delivery> {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": `FabsBot/${VERSION}` };
  if (hook.secret) headers[hook.header] = hook.prefix + sign(hook.secret, body, hook.encoding);
  const timeout = AbortSignal.timeout(WEBHOOK_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(hook.url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.any([stop, timeout]) });
  } catch (e) {
    const code = timeout.aborted ? "timeout" : stop.aborted ? "stopped" : ((e as { code?: string }).code ?? (e as Error).name);
    console.warn(`webhook delivery failed: ${code}`);
    if (timeout.aborted) return { ok: false, detail: `No answer within ${WEBHOOK_TIMEOUT_MS / 1000} seconds. It may still have arrived` };
    if (stop.aborted) return { ok: false, detail: "Stopped before the endpoint answered. It may still have arrived" };
    return { ok: false, detail: "Couldn't reach the endpoint" };
  }
  void res.body?.cancel().catch(() => {});
  if (!res.ok) {
    console.warn(`webhook delivery failed: HTTP ${res.status}`);
    if (res.status >= 300 && res.status < 400) return { ok: false, detail: `Redirected with HTTP ${res.status}, which isn't followed` };
    return { ok: false, detail: `HTTP ${res.status}` };
  }
  return { ok: true, detail: `HTTP ${res.status}` };
}
