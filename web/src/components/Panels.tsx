import { useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import QRCode from "qrcode";
import { Check, ChevronDown, Copy as CopyIcon, Ellipsis, ExternalLink, ListFilter, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { Connector, Device, HostInfo, PairingLink } from "../../../shared/types";
import type { ConnectorPreset } from "../../../shared/templates";
import { api, formatTime } from "../api";
import { useLoad } from "../hooks";
import { useStore } from "../store";
import { Modal } from "./Modal";
import { PluginIcon, pluginLogo } from "./PluginIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

type ShownLink = PairingLink & { qr: string };

async function newPairingLink(): Promise<ShownLink> {
  const link = await api.post<PairingLink>("/api/pairing-links");
  const qr = await QRCode.toString(link.url, { type: "svg", margin: 1, color: { dark: "#111111", light: "#00000000" } });
  return { ...link, qr };
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
      Serves this PC over HTTPS on port {serve.port} of your tailnet. It turns on the mic and install-to-home-screen. Each device still pairs once
      with the QR code. Other apps using Tailscale HTTPS are left alone.
    </span>
  );
  if (serve.problem) status = <span className="text-destructive">{SERVE_PROBLEMS[serve.problem]}</span>;
  else if (serve.enabled && tailscale.serveUrl)
    status = (
      <>
        On at <a className="mono-box underline" href={tailscale.serveUrl}>{tailscale.serveUrl}</a>. The QR code and pairing link use this address.
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

function PairDevice({ host, onChange }: { host?: HostInfo; onChange: () => void }) {
  const [link, setLink] = useState<ShownLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pair = () => {
    setError(null);
    newPairingLink().then(setLink, (e: Error) => setError(e.message));
  };
  const httpsChanged = () => {
    setLink(null);
    onChange();
  };
  return (
    <Card className="flex flex-col gap-4 sm:flex-row">
      {link && <div className="pair-qr size-40 flex-none self-center dark:rounded-xl dark:bg-white dark:p-2 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: link.qr }} />}
      <div role="group" aria-label="Pair your phone or laptop" className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="font-semibold">Pair your phone or laptop</h3>
        <p className="text-sm text-muted-foreground">
          Scan with a device on your tailnet. Each link works once and expires after 5 minutes. The device stays signed in until you remove it.
        </p>
        {link && (
          <>
            <code className="mono-box block truncate rounded-lg bg-muted px-2 py-1.5 font-mono text-xs">{link.url.replace(/code=.*/, "code=•••••")}</code>
            <p className="text-xs text-muted-foreground">Works once, until {formatTime(link.expiresAt)}.</p>
          </>
        )}
        {host?.tailscale.running ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="rounded-full" onClick={pair}>
              {link ? "New link" : "Pair a device"}
            </Button>
            {link && <Copy text={link.url} label="Copy pairing link" />}
          </div>
        ) : (
          host && <p className="text-sm text-muted-foreground">Start Tailscale on this PC to pair a device.</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {host && <TailscaleHttps host={host} onChange={httpsChanged} />}
      </div>
    </Card>
  );
}

function PairedDevices() {
  const devicesVersion = useStore((s) => s.devicesVersion);
  const devices = useLoad(() => api.get<Device[]>("/api/devices"), [devicesVersion]);
  const list = devices.data ?? [];
  return (
    <section aria-label="Paired devices">
      <h3 className="mb-2 font-semibold">Paired devices</h3>
      <div className="flex flex-col divide-y rounded-2xl border">
        {list.length === 0 && <p className="px-4 py-2.5 text-sm text-muted-foreground">No devices yet.</p>}
        {list.map((d) => (
          <div key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2">
                <b className="truncate">{d.label}</b>
                {d.current && <Badge variant="secondary">This device</Badge>}
              </span>
              <span className="text-xs text-muted-foreground">
                Paired {formatTime(d.createdAt)} · last seen {formatTime(d.lastSeenAt)}
              </span>
            </div>
            <Button variant="secondary" size="sm" className="rounded-full" aria-label={`Remove ${d.label}`} onClick={() => api.del(`/api/devices/${d.id}`).then(devices.reload)}>
              Remove
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ThisPcSettings() {
  const hostLoad = useLoad(() => api.get<HostInfo>("/api/host"), []);
  const host = hostLoad.data;
  const reload = hostLoad.reload;
  const ts = host?.tailscale;

  return (
    <div className="flex min-w-0 flex-col gap-4">
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

      <PairDevice host={host} onChange={reload} />
      <PairedDevices />

      <section>
        <h3 className="mb-1 font-semibold">Where bots work</h3>
        <p className="text-sm text-muted-foreground">
          Desks live in <code className="font-mono">{host?.workRoot}</code>. <code className="font-mono">{host?.workRoot}/shared</code> is visible to every bot
          and holds your uploads.
        </p>
      </section>
    </div>
  );
}

type Inherited = { scannedAt: number; servers: { name: string; status: string; kind?: Connector["kind"] }[] };
type PluginSource = "all" | "fabs" | "claude";
type PluginRow = { id: string; name: string; logo?: string; type?: string; custom: boolean; claude: boolean; status: string; connector?: Connector };

const PLUGIN_STATUS: Record<string, string> = { "needs-auth": "Needs sign-in", failed: "Failed", pending: "Starting" };
const PLUGIN_TYPE: Record<Connector["kind"], string> = { http: "Web", stdio: "Local" };

export function PluginsSettings() {
  const connectors = useLoad(() => api.get<Connector[]>("/api/connectors"), []);
  const presets = useLoad(() => api.get<ConnectorPreset[]>("/api/connectors/presets"), []).data ?? [];
  const firstScan = useLoad(() => api.get<Inherited>("/api/connectors/inherited"), []);
  const [rescanned, setRescanned] = useState<Inherited | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<PluginSource>("all");
  const [form, setForm] = useState<(ConnectorPreset & { id?: string }) | null>(null);
  const inherited = rescanned ?? firstScan.data;
  const scanning = rescanning || (!inherited && !firstScan.error);
  const rescan = async () => {
    setRescanning(true);
    try {
      setRescanned(await api.get<Inherited>("/api/connectors/inherited?refresh"));
    } finally {
      setRescanning(false);
    }
  };

  const rows: PluginRow[] = [
    ...(inherited?.servers ?? []).map((s) => ({
      id: `claude:${s.name}`,
      name: s.name.replace(/^claude\.ai /, ""),
      logo: pluginLogo(s.name),
      type: s.kind && PLUGIN_TYPE[s.kind],
      custom: false,
      claude: true,
      status: s.status,
    })),
    ...(connectors.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      logo: pluginLogo(c.preset),
      type: PLUGIN_TYPE[c.kind],
      custom: c.preset === "custom",
      claude: false,
      status: "added",
      connector: c,
    })),
  ];
  const words = query.trim().toLowerCase();
  const shown = rows.filter((r) => (source === "all" || (source === "claude") === r.claude) && r.name.toLowerCase().includes(words));
  const taken = new Set(rows.map((r) => r.logo));
  const builtIn = presets.filter((p) => p.preset !== "custom" && !taken.has(pluginLogo(p.preset)));
  const custom = presets.find((p) => p.preset === "custom");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <InputGroup className="min-w-0 flex-1 sm:max-w-xs">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput value={query} placeholder="Search plugins" aria-label="Search plugins" onChange={(e) => setQuery(e.target.value)} />
        </InputGroup>
        <div className="ml-auto flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Filter plugins" title="Filter plugins">
                <ListFilter />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={source} onValueChange={(v) => setSource(v as PluginSource)}>
                <DropdownMenuRadioItem value="all">All plugins</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="fabs">Added in Fabs Bot</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="claude">From Claude</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus /> Add <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {builtIn.map((p) => (
                <DropdownMenuItem key={p.preset} onSelect={() => setForm(p)}>
                  <PluginIcon logo={pluginLogo(p.preset)} className="size-6 rounded-md" /> {p.name}
                </DropdownMenuItem>
              ))}
              {builtIn.length > 0 && custom && <DropdownMenuSeparator />}
              {custom && (
                <DropdownMenuItem onSelect={() => setForm(custom)}>
                  <PluginIcon className="size-6 rounded-md" /> Custom server
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Plugin</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-normal">
                <div className="flex items-center gap-3">
                  <PluginIcon logo={r.logo} />
                  <span className="font-medium">{r.name}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 text-muted-foreground">
                  {r.type}
                  {r.custom && <Badge variant="outline">Custom</Badge>}
                  {r.claude && <Badge variant="outline">Claude</Badge>}
                </div>
              </TableCell>
              <TableCell>
                {r.status === "connected" || r.status === "added" ? (
                  <Check className="size-4" aria-label={r.status === "added" ? "Added" : "Connected"} />
                ) : (
                  <span className="text-muted-foreground">{PLUGIN_STATUS[r.status] ?? r.status}</span>
                )}
              </TableCell>
              <TableCell>
                {r.connector && (
                  <PluginRowMenu
                    connector={r.connector}
                    onEdit={(c) => setForm({ ...c, blurb: "", secretKeys: [] })}
                    onRemove={(c) => api.del(`/api/connectors/${c.id}`).then(connectors.reload)}
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
          {shown.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                {rows.length === 0 ? "No plugins yet." : "No plugins match."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant="outline">Claude</Badge> From Claude Code and claude.ai · Claude bots only ·
          <Button variant="link" className="h-auto p-0 text-muted-foreground" onClick={rescan} disabled={scanning}>
            {scanning ? "Scanning…" : "Rescan"}
          </Button>
          {inherited && !scanning && <span>scanned {formatTime(inherited.scannedAt)}</span>}
        </p>
        <p>Turn plugins on in each bot's settings.</p>
      </div>
      {form && <ConnectorForm initial={form} onDone={() => (setForm(null), connectors.reload())} />}
    </div>
  );
}

function PluginRowMenu({ connector, onEdit, onRemove }: { connector: Connector; onEdit(c: Connector): void; onRemove(c: Connector): void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`${connector.name} options`} title={`${connector.name} options`}>
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(connector)}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => onRemove(connector)}>
          <Trash2 /> Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
