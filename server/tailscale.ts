// Read-only view of Tailscale. We never change Tailscale settings; we only suggest commands.
import { childEnv, which } from "./providers/spawn";

export interface TailscaleState {
  running: boolean;
  ip: string | null;
  dnsName: string | null;
  login: string | null;
  peers: { name: string; os: string; online: boolean; ip: string }[];
  serveUrl: string | null;
}

async function run(args: string[]): Promise<string | null> {
  const bin = which("tailscale");
  if (!bin) return null;
  try {
    const proc = Bun.spawn([bin, ...args], { env: childEnv, stdout: "pipe", stderr: "ignore" });
    const timer = setTimeout(() => proc.kill(), 4000);
    const out = await new Response(proc.stdout).text();
    clearTimeout(timer);
    return (await proc.exited) === 0 ? out : null;
  } catch {
    return null;
  }
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
  const ip = (self.TailscaleIPs ?? []).find((x: string) => x.includes(".")) ?? null;
  const dnsName = String(self.DNSName ?? "").replace(/\.$/, "") || null;
  const login = s.User?.[self.UserID]?.LoginName ?? null;
  const peers = Object.values(s.Peer ?? {}).map((p: any) => ({
    name: String(p.HostName ?? p.DNSName ?? "device"),
    os: String(p.OS ?? ""),
    online: !!p.Online,
    ip: (p.TailscaleIPs ?? [])[0] ?? "",
  }));

  // Detect an existing `tailscale serve` that points at us (set up by the user).
  let serveUrl: string | null = null;
  const serve = await run(["serve", "status", "--json"]);
  if (serve && dnsName) {
    try {
      const cfg = JSON.parse(serve);
      for (const [host, web] of Object.entries<any>(cfg.Web ?? {})) {
        for (const h of Object.values<any>(web.Handlers ?? {})) {
          if (String(h.Proxy ?? "").includes(`:${port}`)) serveUrl = `https://${host.replace(/:443$/, "")}`;
        }
      }
    } catch {}
  }

  const value = { running: s.BackendState === "Running", ip, dnsName, login, peers, serveUrl };
  cached = { at: Date.now(), value };
  return value;
}
