import { useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import QRCode from "qrcode";
import { Check, Copy as CopyIcon, ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { Connector, HostInfo, ProviderInfo } from "../../../shared/types";
import type { ConnectorPreset } from "../../../shared/templates";
import { api, formatTime } from "../api";
import { useLoad } from "../hooks";
import { Modal } from "./Modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      className="rounded-full"
      onClick={async () => {
        await navigator.clipboard?.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? <Check /> : <CopyIcon />} {done ? "Copied" : label}
    </Button>
  );
}

function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-2xl border p-4", className)}>{children}</section>;
}

const Led = ({ on }: { on: boolean }) => <i className={cn("inline-block size-2 flex-none rounded-full", on ? "bg-working" : "bg-muted-foreground/40")} />;

async function loadHost() {
  const host = await api.get<HostInfo>("/api/host");
  const qr = host.pairUrl ? await QRCode.toString(host.pairUrl, { type: "svg", margin: 1, color: { dark: "#111111", light: "#00000000" } }) : "";
  return { host, qr };
}

const SERVE_PROBLEMS: Record<NonNullable<HostInfo["serve"]["problem"]>, string> = {
  "not-installed": "The tailscale command isn't installed on this PC.",
  "not-logged-in": "Tailscale isn't logged in on this PC.",
  "permission-denied": "Tailscale refused. Run `sudo tailscale set --operator=$USER` once, then try again.",
  "port-taken": "Another app already uses this HTTPS port. Set FABS_TAILSCALE_SERVE_PORT to a free one.",
  "target-busy": "Another app is using the local port Fabs Bot serves HTTPS from.",
  failed: "Tailscale couldn't set up HTTPS. Check that HTTPS is enabled for your tailnet.",
};

function TailscaleHttps({ host, onChange }: { host: HostInfo; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const { serve, tailscale } = host;
  const toggle = async (enabled: boolean) => {
    setBusy(true);
    await api.put("/api/host/serve", { enabled }).catch(() => {});
    setBusy(false);
    onChange();
  };
  let status: ReactNode = (
    <span className="text-muted-foreground">
      Serves this PC over HTTPS on port {serve.port} of your tailnet. It turns on the mic and install-to-home-screen, and your own devices sign in
      without pairing. Other apps using Tailscale HTTPS are left alone.
    </span>
  );
  if (serve.problem) status = <span className="text-destructive">{SERVE_PROBLEMS[serve.problem]}</span>;
  else if (serve.enabled && tailscale.serveUrl)
    status = (
      <>
        On at <a className="mono-box underline" href={tailscale.serveUrl}>{tailscale.serveUrl}</a>. Your own devices sign in automatically.
      </>
    );
  else if (serve.enabled) status = <span className="text-muted-foreground">Turned on, but Tailscale isn't serving it yet.</span>;
  return (
    <div role="group" aria-label="Tailscale HTTPS" className="mt-1 flex flex-col gap-1.5 border-t pt-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="tailscale-https">Tailscale HTTPS</Label>
        <Switch id="tailscale-https" checked={serve.enabled} disabled={busy || !tailscale.running} onCheckedChange={toggle} />
      </div>
      <p className="text-sm">{status}</p>
    </div>
  );
}

export function SettingsPanel() {
  const hostLoad = useLoad(loadHost, []);
  const { host, qr = "" } = hostLoad.data ?? {};
  const reload = hostLoad.reload;
  const providers = useLoad(() => api.get<ProviderInfo[]>("/api/providers?refresh"), []).data ?? [];
  const ts = host?.tailscale;

  return (
    <Modal wide title="This PC">
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="host-line flex items-center gap-3">
              <Led on={!!ts?.running} />
              <div className="flex flex-col">
                <b>{host?.hostname ?? "…"}</b>
                <span className="text-sm text-muted-foreground">
                  {ts?.running ? `Tailscale · ${ts.dnsName ?? ts.ip}` : "Tailscale not running: only this PC can connect"}
                </span>
              </div>
            </div>
            {host && <Badge variant="secondary">v{host.version}</Badge>}
          </div>
          {ts && ts.peers.length > 0 && (
            <div className="host-peers mt-3 flex flex-wrap gap-1.5">
              {ts.peers.map((p) => (
                <span key={p.ip} className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs">
                  <Led on={p.online} /> {p.name} <small className="text-muted-foreground">{p.os}</small>
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-4 sm:flex-row">
          <div className="pair-qr size-40 flex-none self-center [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="font-semibold">Pair your phone or laptop</h3>
            <p className="text-sm text-muted-foreground">
              Scan with a device on your tailnet. The link carries this PC's access key; it's remembered on that device.
            </p>
            {host?.pairUrl ? (
              <>
                <code className="mono-box block truncate rounded-lg bg-muted px-2 py-1.5 font-mono text-xs">{host.pairUrl.replace(/token=.*/, "token=•••••")}</code>
                <div>
                  <Copy text={host.pairUrl} label="Copy pairing link" />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Start Tailscale on this PC to get a link.</p>
            )}
            {host && <TailscaleHttps host={host} onChange={reload} />}
          </div>
        </Card>

        <section>
          <h3 className="mb-2 font-semibold">Agent CLIs on this PC</h3>
          <div className="flex flex-col divide-y rounded-2xl border">
            {providers.map((p) => (
              <div key={p.id} className={cn("grid grid-cols-[auto_8rem_1fr] items-center gap-x-3 px-4 py-2.5 text-sm", !p.installed && "opacity-55")}>
                <Led on={p.installed} />
                <b>{p.label}</b>
                <span className="truncate font-mono text-xs text-muted-foreground">{p.installed ? p.version : "not installed"}</span>
                <span className="col-start-2 col-end-4 text-xs text-muted-foreground">{p.note}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Bots run these CLIs with your existing logins. Fabs Bot passes everything per run (flags only) and never edits their configs.
          </p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">Where bots work</h3>
          <p className="text-sm text-muted-foreground">
            Desks live in <code className="font-mono">{host?.workRoot}</code>. <code className="font-mono">{host?.workRoot}/shared</code> is visible to every bot
            and holds your uploads.
          </p>
        </section>
      </div>
    </Modal>
  );
}

export function ConnectorsPanel() {
  const connectors = useLoad(() => api.get<Connector[]>("/api/connectors"), []);
  const list = connectors.data ?? [];
  const presets = useLoad(() => api.get<ConnectorPreset[]>("/api/connectors/presets"), []).data ?? [];
  const [inherited, setInherited] = useState<{ scannedAt: number; servers: { name: string; status: string }[] } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [form, setForm] = useState<(ConnectorPreset & { id?: string }) | null>(null);
  const scan = async (refresh: boolean) => {
    setScanning(true);
    try {
      setInherited(await api.get(`/api/connectors/inherited${refresh ? "?refresh" : ""}`));
    } finally {
      setScanning(false);
    }
  };

  if (form) return <ConnectorForm initial={form} onDone={() => (setForm(null), connectors.reload())} />;

  return (
    <Modal wide title="Plugins">
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground">Give bots hands: Notion, Google Drive, GitHub, a browser… Turn plugins on per bot in its settings.</p>

        <Card>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h3 className="font-semibold">Inherited by Claude bots</h3>
              <p className="text-xs text-muted-foreground">Your Claude Code MCP servers and claude.ai connectors come along automatically.</p>
            </div>
            <Button variant="secondary" size="sm" className="rounded-full" onClick={() => scan(!!inherited)} disabled={scanning}>
              <RefreshCw /> {scanning ? "Scanning…" : inherited ? "Rescan" : "Scan"}
            </Button>
          </div>
          {inherited && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {inherited.servers.length === 0 && <span className="text-sm text-muted-foreground">None found.</span>}
              {inherited.servers.map((s) => (
                <span key={s.name} className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs">
                  <Led on={s.status === "connected"} /> {s.name.replace(/^claude\.ai /, "")}
                  <small className="text-muted-foreground">{s.status}</small>
                </span>
              ))}
              <span className="text-xs text-muted-foreground">scanned {formatTime(inherited.scannedAt)}</span>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold">Added in Fabs Bot</h3>
          <p className="text-xs text-muted-foreground">Passed to the CLI on each run. Works for Claude and Codex bots.</p>
          {list.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Nothing yet.</p>}
          {list.map((c) => (
            <div key={c.id} className="mt-2 flex items-center gap-3 border-b py-2 last:border-0">
              <b className="text-sm">{c.name}</b>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{c.kind === "http" ? c.url : `${c.command} ${c.args.join(" ")}`}</span>
              <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setForm({ ...c, blurb: "", secretKeys: [] })}>
                Edit
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => api.del(`/api/connectors/${c.id}`).then(connectors.reload)} aria-label="Remove">
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {presets.map((p) => (
              <button key={p.preset} className="flex flex-col gap-1 rounded-xl border p-3 text-left hover:bg-muted/60" onClick={() => setForm(p)}>
                <b className="flex items-center gap-1.5 text-sm">
                  <Plus className="size-3.5" /> {p.name}
                </b>
                <small className="text-xs text-muted-foreground">{p.blurb}</small>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </Modal>
  );
}

const kv = (o: Record<string, string>) =>
  Object.entries(o)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
const parseKv = (s: string) =>
  Object.fromEntries(
    s
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
const parseHeaders = (s: string) =>
  Object.fromEntries(
    s
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes(":"))
      .map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]),
  );

function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      <span>
        {label} {hint && <span className="font-normal text-muted-foreground">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function ConnectorForm({ initial, onDone }: { initial: ConnectorPreset & { id?: string }; onDone(): void }) {
  const [c, setC] = useState(initial);
  const [env, setEnv] = useState(kv(initial.env));
  const [headers, setHeaders] = useState(Object.entries(initial.headers).map(([k, v]) => `${k}: ${v}`).join("\n"));
  const [args, setArgs] = useState(initial.args.join(" "));
  return (
    <Modal title={initial.id ? `Edit ${initial.name}` : `Add ${initial.name}`} onClose={onDone}>
      <div className="flex flex-col gap-4">
        {initial.blurb && <p className="text-sm text-muted-foreground">{initial.blurb}</p>}
        <FormField label="Name">
          <Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
        </FormField>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(
            [
              ["stdio", "Command"],
              ["http", "HTTP URL"],
            ] as const
          ).map(([kind, text]) => (
            <button key={kind} className={cn("rounded-lg px-3 py-1.5 text-sm", c.kind === kind && "bg-background font-medium shadow-sm")} onClick={() => setC({ ...c, kind })}>
              {text}
            </button>
          ))}
        </div>
        {c.kind === "stdio" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Command">
                <Input value={c.command} onChange={(e) => setC({ ...c, command: e.target.value })} placeholder="npx" />
              </FormField>
              <FormField label="Arguments">
                <Input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="-y @scope/server" />
              </FormField>
            </div>
            <FormField label="Environment" hint="KEY=value per line; stored on this PC only">
              <Textarea rows={3} className="font-mono" value={env} onChange={(e) => setEnv(e.target.value)} />
            </FormField>
          </>
        ) : (
          <>
            <FormField label="URL">
              <Input value={c.url} onChange={(e) => setC({ ...c, url: e.target.value })} placeholder="https://…/mcp" />
            </FormField>
            <FormField label="Headers" hint="Name: value per line">
              <Textarea rows={3} className="font-mono" value={headers} onChange={(e) => setHeaders(e.target.value)} />
            </FormField>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button
            className="rounded-full px-6"
            onClick={async () => {
              await api.post("/api/connectors", {
                ...c,
                args: args.split(/\s+/).filter(Boolean),
                env: parseKv(env),
                headers: parseHeaders(headers),
              });
              onDone();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

type Preview = { kind: "image" | "text" | "md" | "other"; content: string };

async function loadPreview(url: string, name: string): Promise<Preview> {
  const blob = await (await fetch(url, { credentials: "same-origin" })).blob();
  const type = blob.type;
  if (type.startsWith("image/")) return { kind: "image", content: url };
  if (/\.(md|markdown)$/i.test(name)) return { kind: "md", content: await blob.text() };
  if (type.startsWith("text/") || /json|xml|javascript|yaml|toml/.test(type) || blob.size < 512 * 1024) {
    const text = await blob.text();
    return text.includes("�") ? { kind: "other", content: "" } : { kind: "text", content: text };
  }
  return { kind: "other", content: "" };
}

export function FileViewer({ url, name }: { url: string; name: string }) {
  const state = useLoad(() => loadPreview(url, name), [url, name]).data;

  return (
    <Modal wide title={name}>
      <div className="max-h-[60dvh] overflow-auto rounded-2xl bg-muted/50 p-4" role="document" aria-label={`Preview of ${name}`}>
        {!state && (
          <span className="typing text-muted-foreground">
            <i />
            <i />
            <i />
          </span>
        )}
        {state?.kind === "image" && <img src={state.content} alt={name} className="mx-auto max-w-full rounded-lg" />}
        {state?.kind === "md" && (
          <article className="bubble leading-relaxed">
            <Markdown remarkPlugins={[remarkGfm, remarkBreaks]}>{state.content}</Markdown>
          </article>
        )}
        {state?.kind === "text" && <pre className="font-mono text-xs whitespace-pre-wrap">{state.content}</pre>}
        {state?.kind === "other" && <p className="text-muted-foreground">No preview for this file type.</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" className="rounded-full" asChild>
          <a href={url + (url.includes("?") ? "&" : "?") + "download"} download={name}>
            Download
          </a>
        </Button>
        <Button variant="secondary" className="rounded-full" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink /> Open
          </a>
        </Button>
      </div>
    </Modal>
  );
}
