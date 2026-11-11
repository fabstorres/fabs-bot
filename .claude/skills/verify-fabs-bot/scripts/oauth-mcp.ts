#!/usr/bin/env bun
import { createHash, randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const port = Number(opt("port", "6105"));
const ttl = Number(opt("ttl", "60"));
const register = !args.includes("--no-register");
const base = `http://127.0.0.1:${port}`;
const PRESET = { id: "fabs-test-client", secret: "fabs-test-secret" };

const rand = () => randomBytes(16).toString("hex");
const clients = new Map<string, { redirectUris: string[] }>();
const codes = new Map<string, { clientId: string; challenge: string; redirectUri: string; resource: string }>();
const access = new Map<string, number>();
const refresh = new Set<string>();
const counts = { registered: 0, authorized: 0, denied: 0, issued: 0, refreshed: 0, revoked: 0, rejected: 0, toolCalls: 0 };
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const json = (d: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(d, { status, headers });

const loopbackOrHttps = (uri: string) => {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" || (u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname));
  } catch {
    return false;
  }
};

function clientFrom(req: Request, form: URLSearchParams) {
  const basic = req.headers.get("authorization")?.match(/^Basic (.+)$/)?.[1];
  if (basic) {
    const [id, secret] = Buffer.from(basic, "base64").toString().split(":").map(decodeURIComponent);
    return id === PRESET.id && secret === PRESET.secret ? id : null;
  }
  const id = form.get("client_id") ?? "";
  if (id === PRESET.id) return form.get("client_secret") === PRESET.secret ? id : null;
  return clients.has(id) ? id : null;
}

function rpc(msg: any) {
  const { id, method } = msg;
  if (id === undefined) return null;
  if (method === "initialize")
    return { jsonrpc: "2.0", id, result: { protocolVersion: msg.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "oauth-test", version: "1" } } };
  if (method === "tools/list")
    return { jsonrpc: "2.0", id, result: { tools: [{ name: "secret_word", description: "Returns today's secret word.", inputSchema: { type: "object", properties: {} } }] } };
  if (method === "tools/call") {
    counts.toolCalls++;
    return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "Today's secret word is marmalade." }] } };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } };
}

async function mcp(req: Request) {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const body = await req.json();
  const out = Array.isArray(body) ? body.map(rpc).filter(Boolean) : rpc(body);
  if (!out || (Array.isArray(out) && !out.length)) return new Response(null, { status: 202 });
  return json(out);
}

const page = (html: string) => new Response(`<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;padding:2rem">${html}</body>`, { headers: { "content-type": "text/html" } });

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.searchParams;
    log(req.method, url.pathname, req.headers.get("authorization") ? "with credentials" : "");
    if (url.pathname === "/.well-known/oauth-protected-resource/mcp") return json({ resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: ["tools"] });
    if (url.pathname === "/.well-known/oauth-authorization-server")
      return json({
        issuer: base,
        authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`,
        ...(register && { registration_endpoint: `${base}/register` }),
        revocation_endpoint: `${base}/revoke`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
      });
    if (url.pathname === "/register" && req.method === "POST" && register) {
      const b = await req.json().catch(() => ({}));
      const uris: string[] = Array.isArray(b.redirect_uris) ? b.redirect_uris : [];
      if (!uris.length || !uris.every(loopbackOrHttps)) return json({ error: "invalid_redirect_uri" }, 400);
      const id = `client-${rand()}`;
      clients.set(id, { redirectUris: uris });
      counts.registered++;
      return json({ client_id: id, redirect_uris: uris, token_endpoint_auth_method: "none" }, 201);
    }
    if (url.pathname === "/authorize") {
      const id = p.get("client_id") ?? "";
      const redirect = p.get("redirect_uri") ?? "";
      const known = id === PRESET.id ? loopbackOrHttps(redirect) : clients.get(id)?.redirectUris.includes(redirect);
      if (!known) return page("<h1>Unknown app or redirect address</h1>");
      if (p.get("code_challenge_method") !== "S256" || !p.get("code_challenge")) return page("<h1>PKCE is required</h1>");
      if (req.method === "GET")
        return page(
          `<h1>Test sign-in</h1><p>Fabs Bot wants to use the test MCP server.</p><form method="post"><button name="decision" value="approve">Approve</button> <button name="decision" value="deny">Deny</button></form>`,
        );
      const decision = new URLSearchParams(await req.text()).get("decision");
      const to = new URL(redirect);
      to.searchParams.set("state", p.get("state") ?? "");
      if (decision !== "approve") {
        counts.denied++;
        to.searchParams.set("error", "access_denied");
      } else {
        const code = rand();
        codes.set(code, { clientId: id, challenge: p.get("code_challenge")!, redirectUri: redirect, resource: p.get("resource") ?? "" });
        counts.authorized++;
        to.searchParams.set("code", code);
      }
      return Response.redirect(to.toString(), 302);
    }
    if (url.pathname === "/token" && req.method === "POST") {
      const f = new URLSearchParams(await req.text());
      const client = clientFrom(req, f);
      if (!client) return json({ error: "invalid_client" }, 401);
      if (f.get("grant_type") === "authorization_code") {
        const c = codes.get(f.get("code") ?? "");
        codes.delete(f.get("code") ?? "");
        const challenge = createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url");
        if (!c || c.clientId !== client || c.challenge !== challenge || c.redirectUri !== f.get("redirect_uri")) return json({ error: "invalid_grant" }, 400);
        if (c.resource !== `${base}/mcp`) return json({ error: "invalid_target" }, 400);
      } else if (f.get("grant_type") === "refresh_token") {
        if (!refresh.delete(f.get("refresh_token") ?? "")) return json({ error: "invalid_grant" }, 400);
        counts.refreshed++;
      } else return json({ error: "unsupported_grant_type" }, 400);
      const at = `at-${rand()}`;
      const rt = `rt-${rand()}`;
      access.set(at, Date.now() + ttl * 1000);
      refresh.add(rt);
      counts.issued++;
      return json({ access_token: at, token_type: "Bearer", expires_in: ttl, refresh_token: rt, scope: "tools" });
    }
    if (url.pathname === "/revoke" && req.method === "POST") {
      const f = new URLSearchParams(await req.text());
      const token = f.get("token") ?? "";
      if (access.delete(token) || refresh.delete(token)) counts.revoked++;
      return new Response(null, { status: 200 });
    }
    if (url.pathname === "/mcp") {
      const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      const until = access.get(token);
      if (!until || until < Date.now()) {
        counts.rejected++;
        return json({ error: "invalid_token" }, 401, { "WWW-Authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp", scope="tools"` });
      }
      return mcp(req);
    }
    if (url.pathname === "/nometa/mcp") return json({ error: "unauthorized" }, 401);
    if (url.pathname === "/open/mcp") return mcp(req);
    if (url.pathname === "/test/expire" && req.method === "POST") {
      for (const key of access.keys()) access.set(key, 0);
      if (p.has("refresh")) refresh.clear();
      return json({ expired: access.size, refreshCleared: p.has("refresh") });
    }
    if (url.pathname === "/test/state") return json({ ...counts, liveAccessTokens: [...access.values()].filter((t) => t > Date.now()).length, liveRefreshTokens: refresh.size });
    return new Response("not found", { status: 404 });
  },
});
log(`oauth-mcp on ${base}  ttl=${ttl}s  registration=${register ? "on" : "off (client fabs-test-client / fabs-test-secret)"}`);
