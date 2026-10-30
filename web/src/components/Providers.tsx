import { useState, type ReactNode } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { ENV_NAME, type ProviderId, type ProviderInfo, type ProviderSettings } from "../../../shared/types";
import { api, formatTime } from "../api";
import { useLoad } from "../hooks";
import { Modal } from "./Modal";
import { ProviderIcon } from "./ProviderIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Patch = Partial<ProviderSettings>;
type TextSetting = "displayName" | "binaryPath" | "launchArgs";
type EnvRow = { name: string; value: string };

export const providerName = (p: ProviderInfo) => p.settings.displayName || p.label;

function providerStatus(p: ProviderInfo) {
  if (!p.settings.enabled) return "Off";
  if (!p.installed) return p.settings.binaryPath ? "Binary not found" : "Not installed";
  return p.supportsTools ? "Ready · full team tools" : "Ready · chat + workspace";
}

export function ProvidersPanel() {
  const loaded = useLoad(() => api.get<ProviderInfo[]>("/api/providers?refresh"), []);
  const [latest, setLatest] = useState<Partial<Record<ProviderId, ProviderInfo>>>({});
  const [selectedId, setSelectedId] = useState<ProviderId>("claude");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const list = (loaded.data ?? []).map((p) => latest[p.id] ?? p);
  const selected = list.find((p) => p.id === selectedId);
  const checkedAt = Math.max(0, ...list.map((p) => p.checkedAt));
  const remember = (fresh: ProviderInfo[]) => setLatest((l) => ({ ...l, ...Object.fromEntries(fresh.map((p) => [p.id, p])) }));
  const save = (id: ProviderId, patch: Patch) => api.put<ProviderInfo>(`/api/providers/${id}`, patch).then((p) => remember([p]));
  const refresh = () => {
    setRefreshing(true);
    api
      .get<ProviderInfo[]>("/api/providers?refresh")
      .then(remember, () => {})
      .finally(() => setRefreshing(false));
  };
  const toggle = (id: ProviderId, enabled: boolean) => {
    setError("");
    save(id, { enabled }).catch((e: Error) => setError(e.message));
  };

  return (
    <Modal title="Providers" className="sm:max-w-5xl">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            The agent CLIs bots run on this PC, with your existing logins. Settings here are passed on each run. Fabs Bot never edits the CLIs' own configs.
          </p>
          <Button variant="ghost" size="sm" className="flex-none rounded-full text-muted-foreground" onClick={refresh} disabled={refreshing || !loaded.data}>
            <RefreshCw className={cn(refreshing && "animate-spin")} />
            <span className="sr-only">Refresh</span>
            {refreshing ? "Checking…" : checkedAt ? `Checked ${formatTime(checkedAt)}` : "Check"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {loaded.error && !loaded.data && (
          <p role="alert" className="text-sm text-destructive">
            {loaded.error}
          </p>
        )}
        {!loaded.data && !loaded.error && <p className="text-sm text-muted-foreground">Checking the agent CLIs on this PC…</p>}
        {loaded.data && (
          <div className="overflow-hidden rounded-2xl border md:grid md:grid-cols-[17rem_minmax(0,1fr)]">
            <div role="group" aria-label="Agent CLIs" className="divide-y border-b bg-muted/30 md:border-r md:border-b-0">
              {list.map((p) => (
                <ProviderRow key={p.id} provider={p} selected={p.id === selectedId} onSelect={() => setSelectedId(p.id)} onToggle={(on) => toggle(p.id, on)} />
              ))}
            </div>
            {selected && <ProviderDetail key={selected.id} provider={selected} onSave={(patch) => save(selected.id, patch)} />}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ProviderRow({
  provider: p,
  selected,
  onSelect,
  onToggle,
}: {
  provider: ProviderInfo;
  selected: boolean;
  onSelect(): void;
  onToggle(enabled: boolean): void;
}) {
  const name = providerName(p);
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3 transition-colors", selected ? "bg-foreground/[0.06]" : "hover:bg-muted/60")}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "flex min-w-0 flex-1 items-start gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
          !p.settings.enabled && !selected && "opacity-60",
        )}
      >
        <ProviderIcon id={p.id} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="max-w-full flex-none truncate text-sm font-medium">{name}</span>
            {p.version && <code className="min-w-0 truncate font-mono text-xs text-muted-foreground">v{p.version}</code>}
          </span>
          <span className="block text-xs text-muted-foreground">{providerStatus(p)}</span>
        </span>
      </button>
      <Switch checked={p.settings.enabled} onCheckedChange={onToggle} aria-label={`Enable ${name}`} />
    </div>
  );
}

function Row({ title, htmlFor, description, children }: { title: string; htmlFor?: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <div className="min-w-0 flex-1">
        <Label htmlFor={htmlFor}>{title}</Label>
        {description && <div className="mt-1.5 text-xs text-muted-foreground">{description}</div>}
      </div>
      {children && <div className="flex lg:w-64 lg:flex-none lg:justify-end">{children}</div>}
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h4 className="border-b px-4 pt-6 pb-2 font-semibold">{children}</h4>;
}

function ProviderDetail({ provider: p, onSave }: { provider: ProviderInfo; onSave(patch: Patch): Promise<void> }) {
  const name = providerName(p);
  const [draft, setDraft] = useState<Partial<Record<TextSetting, string>>>({});
  const [error, setError] = useState("");
  const commit = (patch: Patch) => {
    setError("");
    return onSave(patch).then(
      () => true,
      (e: Error) => (setError(e.message), false),
    );
  };
  const field = (key: TextSetting) => ({
    id: `provider-${key}`,
    value: draft[key] ?? p.settings[key],
    onChange: (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value }),
    onBlur: () => {
      const value = draft[key]?.trim();
      const clearIfUnchanged = () => setDraft((d) => (d[key]?.trim() === value ? { ...d, [key]: undefined } : d));
      if (value === undefined) return;
      if (value === p.settings[key]) return clearIfUnchanged();
      commit({ [key]: value }).then((ok) => ok && clearIfUnchanged());
    },
  });
  const status = p.installed ? (
    <>
      Found at <code className="font-mono break-all">{p.path}</code> · {p.supportsTools ? "full team tools" : "chat + workspace"}
    </>
  ) : p.settings.binaryPath ? (
    <>
      Nothing runnable at <code className="font-mono break-all">{p.settings.binaryPath}</code>.
    </>
  ) : (
    <>
      <code className="font-mono">{p.bin}</code> isn't on this PC's PATH. Install it, or set its binary path below.
    </>
  );

  return (
    <section aria-label={`${name} settings`} className="min-w-0">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <ProviderIcon id={p.id} />
        <h3 className="min-w-0 flex-1 truncate text-lg font-semibold">{name}</h3>
        {p.version && <code className="font-mono text-xs text-muted-foreground">v{p.version}</code>}
      </header>
      {error && (
        <p role="alert" className="border-b px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="divide-y">
        <Row
          title="Status"
          description={
            <>
              <p>{status}</p>
              {p.note && <p className="mt-1">{p.note}</p>}
            </>
          }
        />
        <Row title="Display name" htmlFor="provider-displayName">
          <Input {...field("displayName")} placeholder={p.label} />
        </Row>
      </div>
      <Heading>Runtime</Heading>
      <div className="divide-y">
        <Row title="Binary path" htmlFor="provider-binaryPath" description={`Path to the ${p.label} binary bots run. Leave empty to use ${p.bin} from PATH.`}>
          <Input {...field("binaryPath")} placeholder={p.bin} className="font-mono" spellCheck={false} />
        </Row>
        <Row title="Launch arguments" htmlFor="provider-launchArgs" description="Extra arguments added to every run, before Fabs Bot's own flags.">
          <Input {...field("launchArgs")} className="font-mono" spellCheck={false} />
        </Row>
      </div>
      <Heading>Environment</Heading>
      <EnvVariables env={p.settings.env} onSave={(env) => commit({ env })} />
      <Heading>Models</Heading>
      <div className="px-4 py-3">
        <p className="text-xs text-muted-foreground">Suggested in the bot editor. A bot can use any model the CLI accepts.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.models.filter(Boolean).map((m) => (
            <span key={m} className="rounded-full bg-muted px-2.5 py-1 font-mono text-xs">
              {m}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

const toEnv = (rows: EnvRow[]) => Object.fromEntries(rows.filter((r) => r.name.trim()).map((r) => [r.name.trim(), r.value]));
const invalidName = (rows: EnvRow[]) => rows.map((r) => r.name.trim()).find((name) => name && !ENV_NAME.test(name));

function EnvVariables({ env, onSave }: { env: Record<string, string>; onSave(env: Record<string, string>): void }) {
  const [rows, setRows] = useState<EnvRow[]>(() => Object.entries(env).map(([name, value]) => ({ name, value })));
  const invalid = invalidName(rows);
  const commit = (next: EnvRow[]) => {
    if (invalidName(next) === undefined && JSON.stringify(toEnv(next)) !== JSON.stringify(env)) onSave(toEnv(next));
  };
  const edit = (i: number, patch: Partial<EnvRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => {
    const next = rows.filter((_, j) => j !== i);
    setRows(next);
    commit(next);
  };
  return (
    <div role="group" aria-label="Environment variables">
      <Row title="Variables" description="API keys, base URLs, and other settings this CLI reads from its environment. Stored on this PC only.">
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => setRows([...rows, { name: "", value: "" }])}>
          <Plus /> Add variable
        </Button>
      </Row>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 px-4 pb-3">
          <Input
            aria-label={`Variable ${i + 1} name`}
            placeholder="NAME"
            className="w-2/5 font-mono"
            spellCheck={false}
            value={r.name}
            onChange={(e) => edit(i, { name: e.target.value })}
            onBlur={() => commit(rows)}
          />
          <Input
            aria-label={`Variable ${i + 1} value`}
            placeholder="value"
            className="flex-1 font-mono"
            spellCheck={false}
            value={r.value}
            onChange={(e) => edit(i, { value: e.target.value })}
            onBlur={() => commit(rows)}
          />
          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${r.name.trim() || `variable ${i + 1}`}`} onClick={() => remove(i)}>
            <Trash2 />
          </Button>
        </div>
      ))}
      {invalid && (
        <p role="alert" className="px-4 pb-3 text-xs text-destructive">
          "{invalid}" isn't a valid variable name. Use letters, digits and _, and don't start with a digit.
        </p>
      )}
    </div>
  );
}
