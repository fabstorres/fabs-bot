import { appendFileSync } from "node:fs";

const port = Number(process.argv[2]);
const logFile = process.argv[3];
if (!port || !logFile) {
  console.error("usage: bun webhook-receiver.ts <port> <log.jsonl>");
  process.exit(1);
}

let mode = "202";
let received = 0;

Bun.serve({
  hostname: "127.0.0.1",
  port,
  idleTimeout: 120,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/__mode") {
      mode = url.searchParams.get("set") ?? mode;
      return new Response(`mode=${mode}\n`);
    }
    const body = await req.text();
    received += 1;
    appendFileSync(logFile, JSON.stringify({ n: received, at: new Date().toISOString(), mode, method: req.method, path: url.pathname, headers: Object.fromEntries(req.headers), body }) + "\n");
    if (mode === "hang") {
      await Bun.sleep(60_000);
      return new Response(null, { status: 202 });
    }
    if (mode === "500") return new Response(`Internal error while handling ${url.pathname}`, { status: 500 });
    return Response.json({ deliveryId: `d-${received}` }, { status: 202 });
  },
});
console.log(`webhook receiver on 127.0.0.1:${port}, mode=${mode}, logging to ${logFile}`);
