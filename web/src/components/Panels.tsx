import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import QRCode from "qrcode";
import type { Connector, HostInfo, ProviderInfo } from "../../../shared/types";
import type { ConnectorPreset } from "../../../shared/templates";
import { api, formatSize, formatTime } from "../api";
import { openModal, useStore } from "../store";
import { BotAvatar } from "./BotAvatar";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn-soft small"
      onClick={async () => {
        await navigator.clipboard?.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      <Icon name={done ? "check" : "copy"} size={14} /> {done ? "Copied" : label}
    </button>
  );
}

// ---------- devices & settings ----------

export function SettingsPanel() {
  const [host, setHost] = useState<HostInfo | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [qr, setQr] = useState("");
  useEffect(() => {
    api.get<HostInfo>("/api/host").then((h) => {
      setHost(h);
      if (h.pairUrl) QRCode.toString(h.pairUrl, { type: "svg", margin: 1, color: { dark: "#111111", light: "#00000000" } }).then(setQr);
    });
    api.get<ProviderInfo[]>("/api/providers?refresh").then(setProviders);
  }, []);
  const ts = host?.tailscale;

  return (
    <Modal wide title="This PC">
      <div className="settings">
        <section className="card host-card">
          <div className="host-line">
            <span className={`led ${ts?.running ? "on" : ""}`} />
            <div>
              <b>{host?.hostname ?? "…"}</b>
              <span className="muted">
                {ts?.running ? `Tailscale · ${ts.dnsName ?? ts.ip}` : "Tailscale not running: only this PC can connect"}
              </span>
            </div>
          </div>
          {ts && ts.peers.length > 0 && (
            <div className="peers">
              {ts.peers.map((p) => (
                <span key={p.ip} className={`peer ${p.online ? "online" : ""}`}>
                  <i /> {p.name} <small>{p.os}</small>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="card pair-card">
          <div className="pair-qr" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="pair-text">
            <h3>Pair your phone or laptop</h3>
            <p className="muted">
              Scan with a device on your tailnet. The link carries this PC's access key; it's remembered on that device.
            </p>
            {host?.pairUrl ? (
              <>
                <code className="mono-box">{host.pairUrl.replace(/token=.*/, "token=•••••")}</code>
                <Copy text={host.pairUrl} label="Copy pairing link" />
              </>
            ) : (
              <p className="muted">Start Tailscale on this PC to get a link.</p>
            )}
            <div className="https-tip">
              {ts?.serveUrl ? (
                <p>
                  HTTPS is on: <a href={ts.serveUrl}>{ts.serveUrl}</a>. Your own devices sign in automatically.
                </p>
              ) : (
                <>
                  <p className="muted">
                    Optional: run this yourself for HTTPS (enables mic + install-to-home-screen). Fabs Bot never changes Tailscale settings.
                  </p>
                  <div className="cmd">
                    <code>tailscale serve --bg {host?.port ?? 4800}</code>
                    <Copy text={`tailscale serve --bg ${host?.port ?? 4800}`} />
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <section>
          <h3 className="section-title">Agent CLIs on this PC</h3>
          <div className="provider-table">
            {providers.map((p) => (
              <div key={p.id} className={`provider-row ${p.installed ? "" : "missing"}`}>
                <span className={`led ${p.installed ? "on" : ""}`} />
                <b>{p.label}</b>
                <span className="muted mono">{p.installed ? p.version : "not installed"}</span>
                <span className="muted small">{p.note}</span>
              </div>
            ))}
          </div>
          <p className="muted small">
            Bots run these CLIs with your existing logins. Fabs Bot passes everything per run (flags only) and never edits their configs.
          </p>
        </section>
        <section>
          <h3 className="section-title">Where bots work</h3>
          <p className="muted">
            Desks live in <code>{host?.workRoot}</code>. <code>{host?.workRoot}/shared</code> is visible to every bot and holds your uploads.
          </p>
        </section>
      </div>
    </Modal>
  );
}

// ---------- connectors ----------

export function ConnectorsPanel() {
  const [list, setList] = useState<Connector[]>([]);
  const [presets, setPresets] = useState<ConnectorPreset[]>([]);
  const [inherited, setInherited] = useState<{ scannedAt: number; servers: { name: string; status: string }[] } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [form, setForm] = useState<(ConnectorPreset & { id?: string }) | null>(null);
  const load = () => api.get<Connector[]>("/api/connectors").then(setList);

  useEffect(() => {
    load();
    api.get<ConnectorPreset[]>("/api/connectors/presets").then(setPresets);
  }, []);
  const scan = async (refresh: boolean) => {
    setScanning(true);
    try {
      setInherited(await api.get(`/api/connectors/inherited${refresh ? "?refresh" : ""}`));
    } finally {
      setScanning(false);
    }
  };

  if (form) return <ConnectorForm initial={form} onDone={() => (setForm(null), load())} />;

  return (
    <Modal wide title="Connectors">
      <p className="muted lead">Give bots hands: Notion, Google Drive, GitHub, a browser… Attach connectors per bot in its editor.</p>

      <section className="card">
        <div className="card-head">
          <div>
            <h3>Inherited by Claude bots</h3>
            <p className="muted small">Your Claude Code MCP servers and claude.ai connectors come along automatically.</p>
          </div>
          <button className="btn-soft small" onClick={() => scan(!!inherited)} disabled={scanning}>
            <Icon name="refresh" size={14} /> {scanning ? "Scanning…" : inherited ? "Rescan" : "Scan"}
          </button>
        </div>
        {inherited && (
          <div className="conn-grid">
            {inherited.servers.length === 0 && <span className="muted">None found.</span>}
            {inherited.servers.map((s) => (
              <span key={s.name} className={`conn-pill ${s.status === "connected" ? "ok" : ""}`}>
                <i /> {s.name.replace(/^claude\.ai /, "")}
                <small>{s.status}</small>
              </span>
            ))}
            <span className="muted small">scanned {formatTime(inherited.scannedAt)}</span>
          </div>
        )}
      </section>

      <section className="card">
        <h3>Added in Fabs Bot</h3>
        <p className="muted small">Passed to the CLI on each run. Works for Claude and Codex bots.</p>
        {list.length === 0 && <p className="muted">Nothing yet.</p>}
        {list.map((c) => (
          <div key={c.id} className="conn-row">
            <b>{c.name}</b>
            <span className="muted mono small">{c.kind === "http" ? c.url : `${c.command} ${c.args.join(" ")}`}</span>
            <span className="spacer" />
            <button className="btn-soft small" onClick={() => setForm({ ...c, blurb: "", secretKeys: [] })}>
              Edit
            </button>
            <button className="icon-btn" onClick={() => api.del(`/api/connectors/${c.id}`).then(load)} aria-label="Remove">
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        <div className="preset-grid">
          {presets.map((p) => (
            <button key={p.preset} className="preset" onClick={() => setForm(p)}>
              <b>
                <Icon name="plus" size={14} /> {p.name}
              </b>
              <small>{p.blurb}</small>
            </button>
          ))}
        </div>
      </section>
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

function ConnectorForm({ initial, onDone }: { initial: ConnectorPreset & { id?: string }; onDone(): void }) {
  const [c, setC] = useState(initial);
  const [env, setEnv] = useState(kv(initial.env));
  const [headers, setHeaders] = useState(Object.entries(initial.headers).map(([k, v]) => `${k}: ${v}`).join("\n"));
  const [args, setArgs] = useState(initial.args.join(" "));
  return (
    <Modal title={initial.id ? `Edit ${initial.name}` : `Add ${initial.name}`} onClose={onDone}>
      {initial.blurb && <p className="muted lead">{initial.blurb}</p>}
      <div className="form">
        <label className="field-label">
          Name
          <input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
        </label>
        <div className="seg wide">
          <button className={c.kind === "stdio" ? "on" : ""} onClick={() => setC({ ...c, kind: "stdio" })}>
            Command
          </button>
          <button className={c.kind === "http" ? "on" : ""} onClick={() => setC({ ...c, kind: "http" })}>
            HTTP URL
          </button>
        </div>
        {c.kind === "stdio" ? (
          <>
            <div className="row2">
              <label className="field-label">
                Command
                <input value={c.command} onChange={(e) => setC({ ...c, command: e.target.value })} placeholder="npx" />
              </label>
              <label className="field-label">
                Arguments
                <input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="-y @scope/server" />
              </label>
            </div>
            <label className="field-label">
              Environment <span className="hint">KEY=value per line; stored on this PC only</span>
              <textarea rows={3} className="mono" value={env} onChange={(e) => setEnv(e.target.value)} />
            </label>
          </>
        ) : (
          <>
            <label className="field-label">
              URL
              <input value={c.url} onChange={(e) => setC({ ...c, url: e.target.value })} placeholder="https://…/mcp" />
            </label>
            <label className="field-label">
              Headers <span className="hint">Name: value per line</span>
              <textarea rows={3} className="mono" value={headers} onChange={(e) => setHeaders(e.target.value)} />
            </label>
          </>
        )}
        <div className="row-end">
          <button className="btn-soft" onClick={onDone}>
            Cancel
          </button>
          <button
            className="btn-black"
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
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- a bot's desk (workspace) ----------

type Entry = { name: string; dir: boolean; size: number; mtime: number; path: string };

export function WorkspacePanel({ botId }: { botId: string }) {
  const bot = useStore((s) => s.bots.find((b) => b.id === botId));
  const [path, setPath] = useState("");
  const [data, setData] = useState<{ root: string; path: string; entries: Entry[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setError("");
    api
      .get<{ root: string; path: string; entries: Entry[] }>(`/api/bots/${botId}/files?path=${encodeURIComponent(path)}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [botId, path]);
  if (!bot) return null;
  const crumbs = path ? path.split("/") : [];

  return (
    <Modal
      wide
      label={`${bot.name}'s desk`}
      title={
        <span className="desk-title">
          <BotAvatar shape={bot.shape} color={bot.color} size={30} /> {bot.name}'s desk
        </span>
      }
    >
      <div className="crumbs">
        <button onClick={() => setPath("")}>{data?.root.replace(/^\/home\/[^/]+/, "~") ?? "…"}</button>
        {crumbs.map((c, i) => (
          <span key={i}>
            <Icon name="chevron" size={12} />
            <button onClick={() => setPath(crumbs.slice(0, i + 1).join("/"))}>{c}</button>
          </span>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="desk" role="group" aria-label="Desk files">
        {data?.entries.length === 0 && <p className="muted desk-empty">Empty desk. Files the bot makes will show up here.</p>}
        {data?.entries.map((e) => (
          <button
            key={e.path}
            className="desk-row"
            aria-label={`${e.dir ? "Folder" : "File"} ${e.name}`}
            onClick={() =>
              e.dir
                ? setPath(e.path)
                : openModal({ kind: "file", url: `/api/bots/${botId}/file?path=${encodeURIComponent(e.path)}`, name: e.name })
            }
          >
            <Icon name={e.dir ? "folder" : "file"} size={18} />
            <span className="desk-name">{e.name}</span>
            <span className="muted small">{e.dir ? "" : formatSize(e.size)}</span>
            <span className="muted small">{formatTime(e.mtime)}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ---------- file viewer ----------

export function FileViewer({ url, name }: { url: string; name: string }) {
  const [state, setState] = useState<{ kind: "image" | "text" | "md" | "other"; content: string } | null>(null);
  useEffect(() => {
    let revoke = "";
    fetch(url, { credentials: "same-origin" }).then(async (res) => {
      const blob = await res.blob();
      const type = blob.type;
      if (type.startsWith("image/")) {
        revoke = URL.createObjectURL(blob);
        setState({ kind: "image", content: revoke });
      } else if (/\.(md|markdown)$/i.test(name)) setState({ kind: "md", content: await blob.text() });
      else if (type.startsWith("text/") || /json|xml|javascript|yaml|toml/.test(type) || blob.size < 512 * 1024) {
        const text = await blob.text();
        // Binary files decode with replacement chars; don't show those.
        setState(text.includes("�") ? { kind: "other", content: "" } : { kind: "text", content: text });
      } else setState({ kind: "other", content: "" });
    });
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [url, name]);

  return (
    <Modal wide title={name}>
      <div className="viewer" role="document" aria-label={`Preview of ${name}`}>
        {!state && <span className="typing"><i /><i /><i /></span>}
        {state?.kind === "image" && <img src={state.content} alt={name} />}
        {state?.kind === "md" && (
          <article className="prose">
            <Markdown remarkPlugins={[remarkGfm, remarkBreaks]}>{state.content}</Markdown>
          </article>
        )}
        {state?.kind === "text" && <pre className="code">{state.content}</pre>}
        {state?.kind === "other" && <p className="muted">No preview for this file type.</p>}
      </div>
      <div className="row-end">
        <a className="btn-soft" href={url + (url.includes("?") ? "&" : "?") + "download"} download={name}>
          Download
        </a>
        <a className="btn-soft" href={url} target="_blank" rel="noreferrer">
          <Icon name="external" size={14} /> Open
        </a>
      </div>
    </Modal>
  );
}
