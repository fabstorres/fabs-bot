import { createHash, randomBytes } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Connector, ConnectorAccess, ConnectorAuthState } from "../shared/types";
import { DATA_DIR, VERSION } from "./config";

type Metadata = {
  resource: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  revocationEndpoint: string;
  scope: string;
  authMethods: string[];
};
type Client = { clientId: string; clientSecret?: string };
type Tokens = { accessToken: string; refreshToken?: string; expiresAt: number | null; client: Client };
type Entry = {
  url: string;
  required: boolean | null;
  meta?: Metadata;
  configured?: Client;
  clients: Record<string, Client>;
  unconfirmed?: string;
  tokens?: Tokens;
  signedInAt?: number;
  expired?: boolean;
  problem?: string;
  renewProblem?: string;
};
type Pending = { connectorId: string; verifier: string; redirectUri: string; client: Client; expiresAt: number };

export class SignInError extends Error {}
class TokenError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

const authFile = join(DATA_DIR, "connector-auth.json");
const PENDING_MS = 10 * 60_000;
const REFRESH_EARLY_MS = 60_000;
const TIMEOUT_MS = 10_000;

function load(): Record<string, Entry> {
  try {
    return JSON.parse(readFileSync(authFile, "utf8"));
  } catch {
    return {};
  }
}

const entries = load();
const pending = new Map<string, Pending>();
const refreshing = new Map<string, Promise<void>>();
let changed: (connectorId: string) => void = () => {};

function save() {
  writeFileSync(authFile, JSON.stringify(entries, null, 2), { mode: 0o600 });
  chmodSync(authFile, 0o600);
}

export function onAuthChange(fn: (connectorId: string) => void) {
  changed = fn;
}

const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
const secret = (bytes: number) => randomBytes(bytes).toString("base64url");
const oauthCode = (body: any, status: number) =>
  typeof body?.error === "string" && /^[\w.-]{1,64}$/.test(body.error) ? body.error : `HTTP ${status}`;

export function hasStaticAuth(c: Connector) {
  return Object.entries(c.headers).some(([k, v]) => k.toLowerCase() === "authorization" && v.replace(/^bearer\s*/i, "").trim() !== "");
}

function staticHeaders(c: Connector) {
  return Object.fromEntries(Object.entries(c.headers).filter(([k]) => hasStaticAuth(c) || k.toLowerCase() !== "authorization"));
}

function entryFor(c: Connector): Entry {
  const old = entries[c.id];
  if (old?.url === c.url) return old;
  return (entries[c.id] = { url: c.url, required: null, clients: {}, configured: old?.configured });
}

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function firstJson(urls: string[]) {
  for (const url of urls) {
    const found = await getJson(url);
    if (found) return found;
  }
  return null;
}

function wellKnown(url: string, name: string) {
  const u = new URL(url);
  const path = u.pathname.replace(/\/$/, "");
  return [...new Set([`${u.origin}/.well-known/${name}${path}`, `${u.origin}/.well-known/${name}`])];
}

function serverMetadataUrls(issuer: string) {
  const u = new URL(issuer);
  const path = u.pathname.replace(/\/$/, "");
  return [
    ...new Set([
      `${u.origin}/.well-known/oauth-authorization-server${path}`,
      `${u.origin}/.well-known/openid-configuration${path}`,
      `${u.origin}${path}/.well-known/openid-configuration`,
    ]),
  ];
}

const sameResource = (resource: string, url: string) => url.replace(/\/+$/, "").startsWith(resource.replace(/\/+$/, ""));

async function probe(c: Connector) {
  const res = await fetch(c.url, {
    method: "POST",
    headers: { ...staticHeaders(c), "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fabs-bot", version: VERSION } },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  void res.body?.cancel();
  return res;
}

export async function detect(c: Connector): Promise<void> {
  if (c.kind !== "http") return;
  const e = entryFor(c);
  const where = host(c.url);
  let res: Response;
  try {
    res = await probe(c);
  } catch {
    e.problem = `Couldn't reach ${where}. Check the URL and that the server is running.`;
    return save();
  }
  if (hasStaticAuth(c)) {
    e.required = false;
    e.problem = res.status === 401 || res.status === 403 ? `${where} refused the Authorization header. Check the token in Edit.` : "";
    return save();
  }
  if (res.status !== 401) {
    e.required = false;
    e.problem = res.ok ? "" : `${where} answered HTTP ${res.status}. Check the URL.`;
    return save();
  }
  const challenge = res.headers.get("www-authenticate") ?? "";
  const listed = /resource_metadata="([^"]+)"/i.exec(challenge)?.[1];
  const resourceInfo = await firstJson(listed ? [listed] : wellKnown(c.url, "oauth-protected-resource"));
  const issuer = Array.isArray(resourceInfo?.authorization_servers) ? resourceInfo.authorization_servers[0] : null;
  if (typeof issuer !== "string") {
    e.required = false;
    e.problem = `${where} asks for credentials but doesn't offer sign-in. Add its token as an Authorization header in Edit.`;
    return save();
  }
  const resource = typeof resourceInfo.resource === "string" ? resourceInfo.resource : c.url;
  if (!sameResource(resource, c.url)) {
    e.required = false;
    e.problem = `${where} points sign-in at a different server (${host(resource)}), so Fabs Bot won't use it.`;
    return save();
  }
  const server = await firstJson(serverMetadataUrls(issuer));
  if (typeof server?.authorization_endpoint !== "string" || typeof server?.token_endpoint !== "string") {
    e.required = false;
    e.problem = `Couldn't read the sign-in settings from ${host(issuer)}. Try again later.`;
    return save();
  }
  const pkce = server.code_challenge_methods_supported;
  if (Array.isArray(pkce) && !pkce.includes("S256")) {
    e.required = false;
    e.problem = `${host(issuer)} doesn't support the secure sign-in Fabs Bot needs (PKCE with S256).`;
    return save();
  }
  const scope = /scope="([^"]+)"/i.exec(challenge)?.[1] ?? (Array.isArray(resourceInfo.scopes_supported) ? resourceInfo.scopes_supported.join(" ") : "");
  e.meta = {
    resource,
    issuer,
    authorizationEndpoint: server.authorization_endpoint,
    tokenEndpoint: server.token_endpoint,
    registrationEndpoint: typeof server.registration_endpoint === "string" ? server.registration_endpoint : "",
    revocationEndpoint: typeof server.revocation_endpoint === "string" ? server.revocation_endpoint : "",
    scope,
    authMethods: Array.isArray(server.token_endpoint_auth_methods_supported) ? server.token_endpoint_auth_methods_supported : [],
  };
  e.required = true;
  e.problem = "";
  save();
}

export function needsDetect(c: Connector) {
  const e = entries[c.id];
  return c.kind === "http" && (e?.url !== c.url || (e.required === null && !e.problem));
}

function clientAuth(meta: Metadata, client: Client, body: URLSearchParams): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  const post = meta.authMethods.includes("client_secret_post") && !meta.authMethods.includes("client_secret_basic");
  if (client.clientSecret && !post) {
    const pair = `${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`;
    headers.authorization = `Basic ${Buffer.from(pair).toString("base64")}`;
  } else {
    body.set("client_id", client.clientId);
    if (client.clientSecret) body.set("client_secret", client.clientSecret);
  }
  return headers;
}

async function tokenRequest(meta: Metadata, client: Client, params: Record<string, string>, refreshToken?: string): Promise<Tokens> {
  const body = new URLSearchParams({ ...params, resource: meta.resource });
  const headers = clientAuth(meta, client, body);
  let res: Response;
  try {
    res = await fetch(meta.tokenEndpoint, { method: "POST", headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new TokenError("unreachable", 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || typeof data?.access_token !== "string") throw new TokenError(oauthCode(data, res.status), res.status);
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : refreshToken,
    expiresAt: typeof data.expires_in === "number" ? Date.now() + data.expires_in * 1000 : null,
    client,
  };
}

async function register(e: Entry, meta: Metadata, redirectUri: string): Promise<Client> {
  const where = host(meta.issuer);
  if (!meta.registrationEndpoint)
    throw new SignInError(`${where} doesn't register apps on its own. Create an app for Fabs Bot there and add its client ID in Edit.`);
  let res: Response;
  try {
    res = await fetch(meta.registrationEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_name: "Fabs Bot",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        ...(meta.scope && { scope: meta.scope }),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SignInError(`Couldn't reach ${where} to set up sign-in. Try again later.`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || typeof data?.client_id !== "string")
    throw new SignInError(`${where} wouldn't register Fabs Bot (${oauthCode(data, res.status)}). Add a client ID in Edit instead.`);
  const client: Client = { clientId: data.client_id, ...(typeof data.client_secret === "string" && { clientSecret: data.client_secret }) };
  e.clients[redirectUri] = client;
  save();
  return client;
}

export const usesConfiguredClient = (c: Connector) => !!entries[c.id]?.configured;

export async function startSignIn(c: Connector, redirectUri: string): Promise<string> {
  if (c.kind !== "http") throw new SignInError(`${c.name} runs on this PC, so it has no sign-in.`);
  if (hasStaticAuth(c)) throw new SignInError(`${c.name} uses the Authorization header saved in Edit. Remove it there to sign in instead.`);
  await detect(c);
  const e = entryFor(c);
  if (!e.meta || !e.required) throw new SignInError(e.problem || `${host(c.url)} doesn't ask for sign-in, so ${c.name} is ready to use.`);
  try {
    if (e.unconfirmed === redirectUri) delete e.clients[redirectUri];
    const client = e.configured ?? e.clients[redirectUri] ?? (await register(e, e.meta, redirectUri));
    if (!e.configured) e.unconfirmed = redirectUri;
    const state = secret(24);
    const verifier = secret(32);
    const now = Date.now();
    for (const [key, p] of pending) if (p.expiresAt < now) pending.delete(key);
    pending.set(state, { connectorId: c.id, verifier, redirectUri, client, expiresAt: now + PENDING_MS });
    const url = new URL(e.meta.authorizationEndpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", client.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("resource", e.meta.resource);
    if (e.meta.scope) url.searchParams.set("scope", e.meta.scope);
    e.problem = "";
    save();
    return url.toString();
  } catch (err) {
    if (err instanceof SignInError) {
      e.problem = err.message;
      save();
    }
    throw err;
  }
}

export async function finishSignIn(query: URLSearchParams, find: (id: string) => Connector | null): Promise<Connector> {
  const state = query.get("state") ?? "";
  const flow = pending.get(state);
  pending.delete(state);
  const c = flow && flow.expiresAt > Date.now() ? find(flow.connectorId) : null;
  if (!flow || !c)
    throw new SignInError(
      "This sign-in expired or was already used. Start again from Settings, Plugins. If you approved on another device, paste this page's address into the sign-in window instead.",
    );
  const e = entryFor(c);
  const fail = (message: string): never => {
    e.problem = message;
    save();
    changed(c.id);
    throw new SignInError(message);
  };
  if (!e.meta) return fail(`Sign-in to ${c.name} needs to start again.`);
  if (e.unconfirmed === flow.redirectUri) delete e.unconfirmed;
  const error = query.get("error");
  if (error) return fail(error === "access_denied" ? `Sign-in to ${c.name} was cancelled.` : `${host(e.meta.issuer)} stopped the sign-in (${oauthCode({ error }, 400)}).`);
  const code = query.get("code");
  if (!code) return fail(`${host(e.meta.issuer)} didn't send a sign-in code back. Try again.`);
  try {
    e.tokens = await tokenRequest(e.meta, flow.client, {
      grant_type: "authorization_code",
      code,
      redirect_uri: flow.redirectUri,
      code_verifier: flow.verifier,
    });
  } catch (err) {
    if ((err as TokenError).code === "invalid_client" && e.clients[flow.redirectUri] === flow.client) delete e.clients[flow.redirectUri];
    const why = err instanceof TokenError && err.status === 0 ? "didn't answer" : `refused the sign-in (${(err as TokenError).code})`;
    return fail(`${host(e.meta.issuer)} ${why}. Try again.`);
  }
  e.signedInAt = Date.now();
  delete e.renewProblem;
  e.expired = false;
  e.problem = "";
  save();
  changed(c.id);
  return c;
}

async function refresh(c: Connector, e: Entry) {
  const tokens = e.tokens;
  if (!tokens || !e.meta) return;
  const expire = () => {
    delete e.tokens;
    delete e.renewProblem;
    e.expired = true;
    e.problem = "";
    save();
    changed(c.id);
  };
  if (!tokens.refreshToken) return expire();
  try {
    e.tokens = await tokenRequest(e.meta, tokens.client, { grant_type: "refresh_token", refresh_token: tokens.refreshToken }, tokens.refreshToken);
    delete e.renewProblem;
    save();
  } catch (err) {
    if (err instanceof TokenError && err.status >= 400 && err.status < 500) return expire();
    e.renewProblem = `Couldn't renew the sign-in to ${c.name}: ${host(e.meta.issuer)} didn't answer. Fabs Bot will try again on the next turn.`;
    save();
  }
}

function refreshOnce(c: Connector, e: Entry) {
  let job = refreshing.get(c.id);
  if (!job) {
    job = refresh(c, e).finally(() => refreshing.delete(c.id));
    refreshing.set(c.id, job);
  }
  return job;
}

export async function bearer(c: Connector): Promise<string | null> {
  const e = entries[c.id];
  if (c.kind !== "http" || hasStaticAuth(c) || e?.url !== c.url || !e.tokens) return null;
  if (e.tokens.expiresAt !== null && e.tokens.expiresAt - Date.now() < REFRESH_EARLY_MS) await refreshOnce(c, e);
  return e.tokens?.accessToken ?? null;
}

export async function renew(c: Connector): Promise<boolean> {
  const e = entries[c.id];
  const before = e?.url === c.url ? e.tokens?.accessToken : undefined;
  if (!e || !before) return false;
  await refreshOnce(c, e);
  return !!e.tokens && e.tokens.accessToken !== before;
}

export async function signOut(c: Connector): Promise<boolean> {
  const e = entries[c.id];
  const tokens = e?.tokens;
  if (!e || !tokens) {
    if (e?.expired) {
      e.expired = false;
      save();
      changed(c.id);
    }
    return true;
  }
  let confirmed = !!e.meta?.revocationEndpoint;
  if (e.meta?.revocationEndpoint) {
    const sent: [string | undefined, string][] = [
      [tokens.refreshToken, "refresh_token"],
      [tokens.accessToken, "access_token"],
    ];
    for (const [token, hint] of sent) {
      if (!token) continue;
      const body = new URLSearchParams({ token, token_type_hint: hint });
      const headers = clientAuth(e.meta, tokens.client, body);
      const ok = await fetch(e.meta.revocationEndpoint, { method: "POST", headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) })
        .then((r) => r.ok)
        .catch(() => false);
      confirmed &&= ok;
    }
  }
  delete e.tokens;
  delete e.signedInAt;
  delete e.renewProblem;
  e.expired = false;
  e.problem = "";
  save();
  changed(c.id);
  return confirmed;
}

export function configureClient(c: Connector, clientId: string, clientSecret?: string) {
  const e = entryFor(c);
  const id = clientId.trim();
  if (!id) delete e.configured;
  else {
    const kept = e.configured?.clientId === id ? e.configured.clientSecret : undefined;
    const next = clientSecret?.trim() || kept;
    e.configured = { clientId: id, ...(next && { clientSecret: next }) };
  }
  save();
}

export async function forget(c: Connector) {
  await signOut(c).catch(() => false);
  delete entries[c.id];
  save();
}

function authState(c: Connector, e: Entry | undefined): ConnectorAuthState {
  if (c.kind !== "http") return "none";
  if (hasStaticAuth(c)) return "static";
  if (e?.tokens) return "signed-in";
  if (e?.expired) return "expired";
  if (e?.required) return e.problem ? "failed" : "needed";
  if (e?.problem) return "error";
  return e?.required === false ? "none" : "unknown";
}

export function access(c: Connector): ConnectorAccess {
  const e = entries[c.id]?.url === c.url ? entries[c.id] : undefined;
  const configured = entries[c.id]?.configured;
  return {
    connectorId: c.id,
    auth: authState(c, e),
    issuer: e?.meta ? host(e.meta.issuer) : "",
    clientId: configured?.clientId ?? "",
    hasClientSecret: !!configured?.clientSecret,
    signedInAt: e?.tokens ? (e.signedInAt ?? null) : null,
    expiresAt: e?.tokens?.expiresAt ?? null,
    problem: e?.problem || (e?.tokens && e.renewProblem) || "",
  };
}
