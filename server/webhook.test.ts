import { afterAll, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "fabs-webhook-test-"));
process.env.FABS_DATA_DIR = join(scratch, "data");
process.env.FABS_WORK_ROOT = join(scratch, "work");
const { deliver } = await import("./webhook");

const hits: { path: string; body: string; signature: string | null }[] = [];
const receiver = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    hits.push({ path, body: await req.text(), signature: req.headers.get("x-sig") });
    if (path.startsWith("/moved")) return new Response(null, { status: 302, headers: { Location: "/landed" } });
    if (path.startsWith("/missing")) return new Response(`Cannot POST ${path}`, { status: 404 });
    return Response.json({ deliveryId: "d-1" }, { status: 202 });
  },
});
afterAll(() => receiver.stop(true));

const base = `http://127.0.0.1:${receiver.port}`;
const hook = (path: string, signing = {}) => ({ threadId: "t", url: `${base}${path}`, secret: "", header: "", encoding: "hex" as const, prefix: "", ...signing });
const live = new AbortController().signal;

test("a redirect fails without being followed, and no failure repeats the address", async () => {
  const moved = await deliver(hook("/moved/tok-secret"), "{}", live);
  expect(moved).toEqual({ ok: false, detail: "Redirected with HTTP 302, which isn't followed" });
  expect(hits.some((h) => h.path === "/landed")).toBe(false);

  const missing = await deliver(hook("/missing/tok-secret"), "{}", live);
  expect(missing).toEqual({ ok: false, detail: "HTTP 404" });

  const closed = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = closed.port;
  closed.stop(true);
  const unreachable = await deliver({ ...hook(""), url: `http://127.0.0.1:${port}/hooks/tok-secret` }, "{}", live);
  expect(unreachable).toEqual({ ok: false, detail: "Couldn't reach the endpoint" });
});

test("the signature is the prefix plus the HMAC of the exact raw body in the chosen encoding", async () => {
  const body = JSON.stringify({ requestId: "fabs-1", task: "Investigate the login failure" });
  const result = await deliver(hook("/ok", { secret: "s3cret", header: "X-Sig", encoding: "base64", prefix: "sha256=" }), body, live);
  expect(result).toEqual({ ok: true, detail: "HTTP 202, delivery d-1" });
  const hit = hits.find((h) => h.path === "/ok")!;
  expect(hit.body).toBe(body);
  expect(hit.signature).toBe(`sha256=${createHmac("sha256", "s3cret").update(body).digest("base64")}`);
});
