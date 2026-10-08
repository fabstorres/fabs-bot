/**
 * Tailscale integration. Reads status freely; changes Tailscale only when you turn on
 * Tailscale HTTPS, and then only the one serve port Fabs Bot owns.
 */
import { childEnv, which } from "./providers/spawn";

export interface TailscaleState {
  running: boolean;
  ip: string | null;
  dnsName: string | null;
  login: string | null;
  peers: { name: string; os: string; online: boolean; ip: string }[];
  serveUrl: string | null;
}

/** Why Tailscale HTTPS couldn't be turned on or off. Never raw CLI output: stderr can carry auth keys. */
export type ServeProblem = "not-installed" | "not-logged-in" | "permission-denied" | "port-taken" | "target-busy" | "failed";

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function exec(args: string[], timeoutMs = 4000): Promise<CliResult | null> {
  const bin = which("tailscale");
  if (!bin) return null;
  try {
    const proc = Bun.spawn([bin, ...args], { env: childEnv, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    clearTimeout(timer);
    return { code, stdout, stderr };
  } catch {
    return null;
  }
}

async function run(args: string[]): Promise<string | null> {
  const r = await exec(args);
  return r?.code === 0 ? r.stdout : null;
}

export function isTailnetIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  return parts.length === 4 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255) && parts[0] === 100 && parts[1]! >= 64 && parts[1]! <= 127;
}

interface ServeConfig {
  TCP?: Record<string, { HTTPS?: boolean; TCPForward?: string }>;
  Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }>;
  Foreground?: Record<string, ServeConfig>;
}

async function readServeConfig(): Promise<ServeConfig | ServeProblem> {
  const r = await exec(["serve", "status", "--json"]);
  const problem = problemFrom(r);
  if (problem) return problem;
  try {
    return JSON.parse(r!.stdout || "{}") ?? {};
  } catch {
    return "failed";
  }
}

const withForeground = (cfg: ServeConfig): ServeConfig[] => [cfg, ...Object.values(cfg.Foreground ?? {})];

/** Where each HTTPS serve port proxies to, e.g. `{ 443: ["http://127.0.0.1:3773"] }`. */
function proxiesByPort(cfg: ServeConfig): Map<number, { host: string; proxies: string[] }> {
  const out = new Map<number, { host: string; proxies: string[] }>();
  for (const { Web } of withForeground(cfg)) {
    for (const [hostPort, web] of Object.entries(Web ?? {})) {
      const at = hostPort.lastIndexOf(":");
      const port = Number(hostPort.slice(at + 1));
      const entry = out.get(port) ?? { host: hostPort.slice(0, at), proxies: [] };
      entry.proxies.push(...Object.values(web.Handlers ?? {}).map((h) => String(h.Proxy ?? "")));
      out.set(port, entry);
    }
  }
  return out;
}

const localTarget = (localPort: number) => `http://127.0.0.1:${localPort}`;

function ownedBy(proxy: string, localPort: number) {
  return [localTarget(localPort), `http://localhost:${localPort}`].includes(proxy.replace(/\/$/, ""));
}

function serveUrlFrom(cfg: ServeConfig, localPort: number): string | null {
  for (const [port, { host, proxies }] of proxiesByPort(cfg)) {
    if (proxies.some((p) => ownedBy(p, localPort))) return port === 443 ? `https://${host}` : `https://${host}:${port}`;
  }
  return null;
}

/** Who holds `servePort`: nobody, us, or another app (another app's mapping is never touched). */
function servePortOwner(cfg: ServeConfig, servePort: number, localPort: number): "free" | "us" | "other" {
  const web = proxiesByPort(cfg).get(servePort);
  if (web) return web.proxies.every((p) => ownedBy(p, localPort)) ? "us" : "other";
  return withForeground(cfg).some((c) => c.TCP?.[servePort]) ? "other" : "free";
}

function problemFrom(r: CliResult | null): ServeProblem | null {
  if (!r) return "not-installed";
  if (r.code === 0) return null;
  if (/not logged in|logged out|needs? login/i.test(r.stderr)) return "not-logged-in";
  if (/permission denied|access denied|must be root|operation not permitted/i.test(r.stderr)) return "permission-denied";
  return "failed";
}

/**
 * Point `https://<this-pc>:<servePort>` at the local server, unless another app already uses that port.
 * This guards against collisions; it can't stop another app changing serve config at the same moment.
 */
export async function enableServe(localPort: number, servePort: number): Promise<ServeProblem | null> {
  if (servePort === 443) return "port-taken";
  const cfg = await readServeConfig();
  if (typeof cfg === "string") return cfg;
  if (servePortOwner(cfg, servePort, localPort) === "other") return "port-taken";
  const problem = problemFrom(await exec(["serve", "--bg", `--https=${servePort}`, localTarget(localPort)], 10_000));
  cached = null;
  return problem;
}

/** Remove our mapping on `servePort`. Leaves the port alone when it belongs to another app. */
export async function disableServe(localPort: number, servePort: number): Promise<ServeProblem | null> {
  const cfg = await readServeConfig();
  if (typeof cfg === "string") return cfg;
  if (servePortOwner(cfg, servePort, localPort) !== "us") return null;
  const problem = problemFrom(await exec(["serve", `--https=${servePort}`, "off"], 10_000));
  cached = null;
  return problem;
}

let cached: { at: number; value: TailscaleState } | null = null;

export async function tailscaleState(port: number): Promise<TailscaleState> {
  if (cached && Date.now() - cached.at < 10_000) return cached.value;
  const empty: TailscaleState = { running: false, ip: null, dnsName: null, login: null, peers: [], serveUrl: null };
  const raw = await run(["status", "--json"]);
  if (!raw) return empty;
  let s: any;
  try {
    s = JSON.parse(raw);
  } catch {
    return empty;
  }
  const self = s.Self ?? {};
  const ip = (self.TailscaleIPs ?? []).find(isTailnetIpv4) ?? null;
  const dnsName = String(self.DNSName ?? "").replace(/\.$/, "") || null;
  const login = s.User?.[self.UserID]?.LoginName ?? null;
  const peers = Object.values(s.Peer ?? {}).map((p: any) => ({
    name: String(p.HostName ?? p.DNSName ?? "device"),
    os: String(p.OS ?? ""),
    online: !!p.Online,
    ip: (p.TailscaleIPs ?? [])[0] ?? "",
  }));

  const serve = dnsName ? await readServeConfig() : null;
  const serveUrl = serve && typeof serve === "object" ? serveUrlFrom(serve, port) : null;

  const value = { running: s.BackendState === "Running", ip, dnsName, login, peers, serveUrl };
  cached = { at: Date.now(), value };
  return value;
}
