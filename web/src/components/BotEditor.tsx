import { useRef, useState, type ReactNode, type RefObject } from "react";
import { Clock, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { Bot, Connector, ProviderInfo, Routine } from "../../../shared/types";
import { COLORS, SHAPES } from "../../../shared/templates";
import { api, formatTime } from "../api";
import { useLoad } from "../hooks";
import { closeModal, useStore } from "../store";
import { BotAvatar } from "./BotAvatar";
import { Modal } from "./Modal";
import { providerName } from "./Providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { onRadioGroupKeyDown, radioTabIndex } from "@/lib/radio";
import { cn } from "@/lib/utils";

type Draft = Omit<Bot, "id" | "createdAt">;

export const blankBot: Draft = {
  name: "",
  label: "",
  role: "",
  instructions: "",
  shape: "blob",
  color: "#7B3FF2",
  provider: "claude",
  model: "",
  cwd: "",
  autonomy: "full",
  connectorIds: [],
  isTeamLead: false,
};

const SCHEDULES: [string, string][] = [
  ["Every day at 8:00 AM", "0 8 * * *"],
  ["Weekdays at 8:00 AM", "0 8 * * 1-5"],
  ["Every day at 9:00 PM", "0 21 * * *"],
  ["Sundays at 8:41 AM", "41 8 * * 0"],
  ["Every hour", "0 * * * *"],
  ["Every 15 minutes", "*/15 * * * *"],
];

export const scheduleLabel = (cron: string) => SCHEDULES.find((s) => s[1] === cron)?.[0] ?? cron;

export function BotEditor({ botId }: { botId: string }) {
  const existing = useStore((s) => s.bots.find((b) => b.id === botId));
  const nameRef = useRef<HTMLInputElement>(null);
  if (!existing) return null;
  return (
    <Modal wide label={`Edit ${existing.name}`} initialFocus={nameRef}>
      <Editor key={existing.id} existing={existing} nameRef={nameRef} />
    </Modal>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        {label} {hint && <span className="font-normal text-muted-foreground">· {hint}</span>}
      </span>
      {children}
    </div>
  );
}

function Editor({ existing, nameRef }: { existing: Bot; nameRef: RefObject<HTMLInputElement | null> }) {
  const providers = useLoad(() => api.get<ProviderInfo[]>("/api/providers"), []).data ?? [];
  const connectors = useLoad(() => api.get<Connector[]>("/api/connectors"), []).data ?? [];
  const [draft, setDraft] = useState<Draft>(existing);
  const [lead, setLead] = useState<boolean | null>(null);
  const isTeamLead = lead ?? existing.isTeamLead;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const provider = providers.find((p) => p.id === draft.provider);
  const brains = providers.length
    ? providers.filter((p) => p.settings.enabled || p.id === existing.provider)
    : [{ id: "claude", label: "Claude Code", installed: true, settings: { displayName: "" } } as ProviderInfo];

  async function save() {
    if (!draft.name.trim()) return setError("Give your bot a name.");
    setSaving(true);
    try {
      await api.put<Bot>(`/api/bots/${existing.id}`, { ...draft, isTeamLead });
      closeModal();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-[220px_1fr]">
      <div className="flex flex-col items-center gap-4 md:sticky md:top-0 md:self-start">
        <BotAvatar shape={draft.shape} color={draft.color} size={140} />
        <div className="text-center">
          <div className="text-lg font-semibold">{draft.name || "Unnamed bot"}</div>
          <div className="text-sm text-muted-foreground">{draft.role || "What does it do?"}</div>
        </div>
        <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label="Shape" onKeyDown={onRadioGroupKeyDown}>
          {SHAPES.map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={draft.shape === s}
              tabIndex={radioTabIndex(s, draft.shape, SHAPES)}
              className={cn("rounded-lg border-2 border-transparent p-1 hover:bg-muted", draft.shape === s && "border-foreground/80")}
              onClick={() => set({ shape: s })}
              aria-label={s}
            >
              <BotAvatar shape={s} color={draft.color} size={28} />
            </button>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Color" onKeyDown={onRadioGroupKeyDown}>
          {COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={draft.color === c}
              tabIndex={radioTabIndex(c, draft.color, COLORS)}
              className={cn("size-6 rounded-full ring-offset-2", draft.color === c && "ring-2 ring-(--ring-color)")}
              style={{ background: c, ["--ring-color" as string]: c }}
              onClick={() => set({ color: c })}
              aria-label={c}
            />
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <Field label="Name">
          <Input ref={nameRef} aria-label="Name" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Chief of Staff" />
        </Field>
        <Field label="Role" hint="one line; teammates see this">
          <Input aria-label="Role" value={draft.role} onChange={(e) => set({ role: e.target.value })} placeholder="Reads tomorrow's calendar, preps a morning digest" />
        </Field>
        <Field label="How it works">
          <Textarea
            rows={4}
            aria-label="How it works"
            value={draft.instructions}
            onChange={(e) => set({ instructions: e.target.value })}
            placeholder="Standing instructions: tone, what to check, what never to do…"
          />
        </Field>

        <Field label="Brain">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Brain" onKeyDown={onRadioGroupKeyDown}>
            {brains.map((p) => (
              <button
                key={p.id}
                role="radio"
                aria-checked={draft.provider === p.id}
                tabIndex={radioTabIndex(p.id, draft.provider, brains.filter((b) => b.installed).map((b) => b.id))}
                aria-label={providerName(p)}
                className={cn(
                  "flex flex-col rounded-xl border px-3 py-2 text-left transition-colors enabled:hover:bg-muted disabled:opacity-45",
                  draft.provider === p.id && "border-foreground bg-muted",
                )}
                onClick={() => set({ provider: p.id, model: "" })}
                disabled={!p.installed}
                title={p.installed ? p.version : "Not installed"}
              >
                <span className="text-sm font-medium">{providerName(p)}</span>
                <small className="text-xs text-muted-foreground">{p.installed ? (p.supportsTools ? "full team tools" : "chat + workspace") : "not installed"}</small>
              </button>
            ))}
          </div>
          {provider?.note && <p className="text-xs text-muted-foreground">{provider.note}</p>}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Model" hint="blank = CLI default">
            <Input list="models" aria-label="Model" value={draft.model} onChange={(e) => set({ model: e.target.value })} placeholder="default" />
            <datalist id="models">
              {provider?.models.filter(Boolean).map((m) => <option key={m} value={m} />)}
            </datalist>
          </Field>
          <Field label="Desk folder" hint="where it works">
            <Input aria-label="Desk folder" value={draft.cwd} onChange={(e) => set({ cwd: e.target.value })} placeholder="~/FabsBot/<name>" />
          </Field>
        </div>

        <Field label="Autonomy">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Autonomy" onKeyDown={onRadioGroupKeyDown}>
            {(
              [
                ["full", "Just do it"],
                ["ask", "Ask me before acting"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                role="radio"
                aria-checked={draft.autonomy === value}
                tabIndex={draft.autonomy === value ? 0 : -1}
                className={cn("rounded-lg px-3 py-1.5 text-sm", draft.autonomy === value && "bg-background font-medium shadow-sm")}
                onClick={() => set({ autonomy: value })}
              >
                {text}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {draft.autonomy === "full"
              ? "Runs commands and edits files on this PC without asking. Best for trusted, well-scoped bots."
              : "Reading is free; commands and edits show up as Allow / Deny cards on your phone."}
          </p>
        </Field>

        <Field label="Team lead">
          <label className="flex items-center gap-3 text-sm">
            <Switch aria-label="Team lead" checked={isTeamLead} onCheckedChange={setLead} />
            Starts groups and invites teammates without asking you
          </label>
          <p className="text-xs text-muted-foreground">Only one bot can lead. Turning this on hands the role over from the current lead.</p>
        </Field>

        <Field label="Plugins">
          {connectors.length === 0 ? (
            <p className="text-xs text-muted-foreground">No extra plugins yet. Claude and Codex bots already use the MCP servers set up in their own CLI.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {connectors.map((c) => {
                const on = draft.connectorIds.includes(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-3 text-sm">
                    <Switch
                      aria-label={c.name}
                      checked={on}
                      onCheckedChange={() => set({ connectorIds: on ? draft.connectorIds.filter((x) => x !== c.id) : [...draft.connectorIds, c.id] })}
                    />
                    {c.name}
                  </label>
                );
              })}
            </div>
          )}
        </Field>

        <Routines bot={existing} />

        {error && <p className="text-sm text-failing">{error}</p>}
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button
            variant="ghost"
            className="text-failing hover:text-failing"
            onClick={async () => {
              if (!confirm(`Retire ${existing.name}? Its desk folder stays on disk.`)) return;
              await api.del(`/api/bots/${existing.id}`);
              closeModal();
            }}
          >
            <Trash2 /> Retire
          </Button>
          <Button
            variant="ghost"
            title="Forget CLI sessions so the next message starts fresh (threads stay)."
            onClick={async () => {
              await api.post(`/api/bots/${existing.id}/reset`);
              alert("Sessions reset. Threads are kept; the bot will re-read them next time.");
            }}
          >
            <RefreshCw /> Fresh memory
          </Button>
          <Button className="ml-auto rounded-full px-6" onClick={save} disabled={saving}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function Routines({ bot }: { bot: Bot }) {
  const routines = useLoad(() => api.get<Routine[]>("/api/routines"), [bot.id]);
  const list = routines.data?.filter((r) => r.botId === bot.id) ?? [];
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", cron: SCHEDULES[0]![1], prompt: "" });

  return (
    <Field label="Routines" hint="always-on work, on a schedule">
      <div className="flex flex-col gap-2">
        {list.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-xl border px-3 py-2" role="group" aria-label={`Routine ${r.name}`}>
            <Clock className="size-4 flex-none text-green-600" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{r.name}</div>
              <div className="text-xs text-muted-foreground">
                {scheduleLabel(r.cron)}
                {r.nextRunAt ? ` · next ${formatTime(r.nextRunAt)}` : ""}
              </div>
            </div>
            <Button variant="secondary" size="sm" className="rounded-full" onClick={() => api.post(`/api/routines/${r.id}/run`)}>
              <Play /> Run now
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => api.del(`/api/routines/${r.id}`).then(routines.reload)} aria-label="Delete">
              <Trash2 />
            </Button>
          </div>
        ))}
        {adding ? (
          <div className="flex flex-col gap-2 rounded-xl border p-3">
            <Input aria-label="Routine name" placeholder="Name, e.g. Morning briefing" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                value={SCHEDULES.some((s) => s[1] === form.cron) ? form.cron : "custom"}
                onValueChange={(v) => setForm({ ...form, cron: v === "custom" ? "" : v })}
              >
                <SelectTrigger aria-label="Schedule" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULES.map(([l, c]) => (
                    <SelectItem key={c} value={c}>
                      {l}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom cron…</SelectItem>
                </SelectContent>
              </Select>
              <Input aria-label="Cron" placeholder="cron: m h dom mon dow" value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })} />
            </div>
            <Textarea rows={2} aria-label="Routine prompt" placeholder="What should it do each time?" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="rounded-full"
                disabled={!form.name || !form.cron || !form.prompt}
                onClick={async () => {
                  await api.post("/api/routines", { ...form, botId: bot.id });
                  setAdding(false);
                  setForm({ name: "", cron: SCHEDULES[0]![1], prompt: "" });
                  routines.reload();
                }}
              >
                Add routine
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" size="sm" className="self-start rounded-full" onClick={() => setAdding(true)}>
            <Plus /> Add routine
          </Button>
        )}
      </div>
    </Field>
  );
}
