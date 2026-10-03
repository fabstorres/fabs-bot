import { useEffect, useState } from "react";
import type { Bot, Connector, ProviderInfo, Routine } from "../../../shared/types";
import { BOT_TEMPLATES, COLORS, SHAPES, type BotTemplate } from "../../../shared/templates";
import { api, formatTime } from "../api";
import { closeModal, openDirect, useStore } from "../store";
import { BotAvatar } from "./BotAvatar";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

type Draft = Omit<Bot, "id" | "createdAt"> & { id?: string };

const blank: Draft = {
  name: "",
  role: "",
  instructions: "",
  shape: "blob",
  color: "#7B3FF2",
  provider: "claude",
  model: "",
  cwd: "",
  autonomy: "full",
  connectorIds: [],
};

const fromTemplate = (t: BotTemplate): Draft => ({ ...blank, ...t });

export function BotEditor({ botId, onboarding }: { botId?: string; onboarding?: boolean }) {
  const existing = useStore((s) => s.bots.find((b) => b.id === botId));
  const [step, setStep] = useState<"meet" | "edit">(onboarding && !existing ? "meet" : "edit");
  const [draft, setDraft] = useState<Draft>(existing ?? blank);

  if (step === "meet") {
    return (
      <Modal label="Meet your first bot">
        <Meet
          onStart={async (t) => {
            const bot = await api.post<Bot>("/api/bots", fromTemplate(t));
            closeModal();
            await openDirect(bot.id);
          }}
          onCustomize={(t) => {
            setDraft(t ? fromTemplate(t) : blank);
            setStep("edit");
          }}
        />
      </Modal>
    );
  }
  return (
    <Modal wide label={existing ? `Edit ${existing.name}` : "New bot"}>
      <Editor draft={draft} setDraft={setDraft} existing={existing} />
    </Modal>
  );
}

function Meet({ onStart, onCustomize }: { onStart(t: BotTemplate): void; onCustomize(t?: BotTemplate): void }) {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const t = BOT_TEMPLATES[i]!;
  const go = (d: number) => setI((i + d + BOT_TEMPLATES.length) % BOT_TEMPLATES.length);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (e.key === "ArrowRight" ? go(1) : e.key === "ArrowLeft" ? go(-1) : null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div className="meet">
      <h1>Meet your first bot</h1>
      <div className="meet-stage">
        <button className="round ghost" onClick={() => go(-1)} aria-label="Previous">
          <Icon name="back" />
        </button>
        <div className="meet-bot" key={t.key}>
          <BotAvatar shape={t.shape} color={t.color} size={220} />
        </div>
        <button className="round ghost flip" onClick={() => go(1)} aria-label="Next">
          <Icon name="back" />
        </button>
      </div>
      <div className="meet-text" key={t.key + "-t"}>
        <h3>{t.name}</h3>
        <p>{t.role}</p>
        <span className="chip">{t.provider === "codex" ? "Runs on Codex" : "Runs on Claude Code"}</span>
      </div>
      <div className="dots">
        {BOT_TEMPLATES.map((x, j) => (
          <button key={x.key} className={j === i ? "on" : ""} onClick={() => setI(j)} aria-label={x.name} />
        ))}
      </div>
      <button
        className="btn-black big"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onStart(t);
        }}
      >
        Start Chat
      </button>
      <div className="meet-links">
        <button className="link" onClick={() => onCustomize(t)}>
          Customize {t.name}
        </button>
        <span>·</span>
        <button className="link" onClick={() => onCustomize()}>
          Create my own
        </button>
      </div>
    </div>
  );
}

function Editor({ draft, setDraft, existing }: { draft: Draft; setDraft(d: Draft): void; existing?: Bot }) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api.get<ProviderInfo[]>("/api/providers").then(setProviders);
    api.get<Connector[]>("/api/connectors").then(setConnectors);
  }, []);
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const provider = providers.find((p) => p.id === draft.provider);

  async function save() {
    if (!draft.name.trim()) return setError("Give your bot a name.");
    setSaving(true);
    try {
      const bot = existing ? await api.put<Bot>(`/api/bots/${existing.id}`, draft) : await api.post<Bot>("/api/bots", draft);
      closeModal();
      if (!existing) await openDirect(bot.id);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="editor">
      <div className="editor-preview">
        <div className="editor-avatar">
          <BotAvatar shape={draft.shape} color={draft.color} size={180} />
        </div>
        <div className="editor-name">{draft.name || "Unnamed bot"}</div>
        <div className="editor-role">{draft.role || "What does it do?"}</div>
        <div className="shape-grid">
          {SHAPES.map((s) => (
            <button key={s} className={draft.shape === s ? "on" : ""} onClick={() => set({ shape: s })} aria-label={s}>
              <BotAvatar shape={s} color={draft.shape === s ? draft.color : "#CFCFCA"} size={34} />
            </button>
          ))}
        </div>
        <div className="color-row">
          {COLORS.map((c) => (
            <button key={c} className={draft.color === c ? "on" : ""} style={{ background: c }} onClick={() => set({ color: c })} aria-label={c} />
          ))}
        </div>
      </div>

      <div className="editor-form">
        <h2>{existing ? `Edit ${existing.name}` : "New bot"}</h2>
        <label className="field-label">
          Name
          <input aria-label="Name" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Chief of Staff" autoFocus={!existing} />
        </label>
        <label className="field-label">
          Role <span className="hint">one line; teammates see this</span>
          <input aria-label="Role" value={draft.role} onChange={(e) => set({ role: e.target.value })} placeholder="Reads tomorrow's calendar, preps a morning digest" />
        </label>
        <label className="field-label">
          How it works
          <textarea
            rows={4}
            aria-label="How it works"
            value={draft.instructions}
            onChange={(e) => set({ instructions: e.target.value })}
            placeholder="Standing instructions: tone, what to check, what never to do…"
          />
        </label>

        <div className="field-label">
          Brain
          <div className="provider-grid" role="radiogroup" aria-label="Brain">
            {(providers.length ? providers : [{ id: "claude", label: "Claude Code", installed: true } as ProviderInfo]).map((p) => (
              <button
                key={p.id}
                role="radio"
                aria-checked={draft.provider === p.id}
                aria-label={p.label}
                className={`provider ${draft.provider === p.id ? "on" : ""} ${p.installed ? "" : "missing"}`}
                onClick={() => set({ provider: p.id, model: "" })}
                disabled={!p.installed}
                title={p.installed ? p.version : "Not installed"}
              >
                <span>{p.label}</span>
                <small>{p.installed ? (p.supportsTools ? "full team tools" : "chat + workspace") : "not installed"}</small>
              </button>
            ))}
          </div>
          {provider?.note && <p className="hint block">{provider.note}</p>}
        </div>

        <div className="row2">
          <label className="field-label">
            Model <span className="hint">blank = CLI default</span>
            <input list="models" aria-label="Model" value={draft.model} onChange={(e) => set({ model: e.target.value })} placeholder="default" />
            <datalist id="models">
              {provider?.models.filter(Boolean).map((m) => <option key={m} value={m} />)}
            </datalist>
          </label>
          <label className="field-label">
            Desk folder <span className="hint">where it works</span>
            <input aria-label="Desk folder" value={draft.cwd} onChange={(e) => set({ cwd: e.target.value })} placeholder="~/FabsBot/<name>" />
          </label>
        </div>

        <div className="field-label">
          Autonomy
          <div className="seg wide" role="radiogroup" aria-label="Autonomy">
            <button role="radio" aria-checked={draft.autonomy === "full"} className={draft.autonomy === "full" ? "on" : ""} onClick={() => set({ autonomy: "full" })}>
              Just do it
            </button>
            <button role="radio" aria-checked={draft.autonomy === "ask"} className={draft.autonomy === "ask" ? "on" : ""} onClick={() => set({ autonomy: "ask" })}>
              Ask me before acting
            </button>
          </div>
          <p className="hint block">
            {draft.autonomy === "full"
              ? "Runs commands and edits files on this PC without asking. Best for trusted, well-scoped bots."
              : "Reading is free; commands and edits show up as Allow / Deny cards on your phone."}
          </p>
        </div>

        <div className="field-label">
          Connectors
          {connectors.length === 0 ? (
            <p className="hint block">
              No extra connectors yet. Claude bots already inherit your Claude Code MCP servers and claude.ai connectors.
            </p>
          ) : (
            <div className="toggle-list">
              {connectors.map((c) => {
                const on = draft.connectorIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    role="switch"
                    aria-checked={on}
                    aria-label={c.name}
                    className={`toggle ${on ? "on" : ""}`}
                    onClick={() =>
                      set({ connectorIds: on ? draft.connectorIds.filter((x) => x !== c.id) : [...draft.connectorIds, c.id] })
                    }
                  >
                    <span className="switch" />
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {existing && <Routines bot={existing} />}

        {error && <p className="error">{error}</p>}
        <div className="editor-actions">
          {existing && (
            <button
              className="btn-soft danger"
              onClick={async () => {
                if (!confirm(`Retire ${existing.name}? Its desk folder stays on disk.`)) return;
                await api.del(`/api/bots/${existing.id}`);
                closeModal();
              }}
            >
              <Icon name="trash" size={16} /> Retire
            </button>
          )}
          {existing && (
            <button
              className="btn-soft"
              title="Forget CLI sessions so the next message starts fresh (threads stay)."
              onClick={async () => {
                await api.post(`/api/bots/${existing.id}/reset`);
                alert("Sessions reset. Threads are kept; the bot will re-read them next time.");
              }}
            >
              <Icon name="refresh" size={16} /> Fresh memory
            </button>
          )}
          <span className="spacer" />
          <button className="btn-black" onClick={save} disabled={saving}>
            {existing ? "Save" : "Create & chat"}
          </button>
        </div>
      </div>
    </div>
  );
}

const SCHEDULES: [string, string][] = [
  ["Every morning, 8:00", "0 8 * * *"],
  ["Weekdays, 8:00", "0 8 * * 1-5"],
  ["Every evening, 21:00", "0 21 * * *"],
  ["Sundays, 8:41", "41 8 * * 0"],
  ["Every hour", "0 * * * *"],
  ["Every 15 minutes", "*/15 * * * *"],
];

function Routines({ bot }: { bot: Bot }) {
  const [list, setList] = useState<Routine[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", cron: SCHEDULES[0]![1], prompt: "" });
  const load = () => api.get<Routine[]>("/api/routines").then((rs) => setList(rs.filter((r) => r.botId === bot.id)));
  useEffect(() => void load(), [bot.id]);
  const label = (cron: string) => SCHEDULES.find((s) => s[1] === cron)?.[0] ?? cron;

  return (
    <div className="field-label">
      Routines <span className="hint">always-on work, on a schedule</span>
      <div className="routines">
        {list.map((r) => (
          <div key={r.id} className="routine" role="group" aria-label={`Routine ${r.name}`}>
            <Icon name="clock" size={16} />
            <div className="routine-main">
              <b>{r.name}</b>
              <span>
                {label(r.cron)}
                {r.nextRunAt ? ` · next ${formatTime(r.nextRunAt)}` : ""}
              </span>
            </div>
            <button className="btn-soft small" onClick={() => api.post(`/api/routines/${r.id}/run`)}>
              Run now
            </button>
            <button className="icon-btn" onClick={() => api.del(`/api/routines/${r.id}`).then(load)} aria-label="Delete">
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        {adding ? (
          <div className="routine-form">
            <input aria-label="Routine name" placeholder="Name, e.g. Morning digest" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="row2">
              <select
                aria-label="Schedule"
                value={SCHEDULES.some((s) => s[1] === form.cron) ? form.cron : "custom"}
                onChange={(e) => setForm({ ...form, cron: e.target.value === "custom" ? "" : e.target.value })}
              >
                {SCHEDULES.map(([l, c]) => (
                  <option key={c} value={c}>
                    {l}
                  </option>
                ))}
                <option value="custom">Custom cron…</option>
              </select>
              <input aria-label="Cron" placeholder="cron: m h dom mon dow" value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })} />
            </div>
            <textarea rows={2} aria-label="Routine prompt" placeholder="What should it do each time?" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
            <div className="row-end">
              <button className="btn-soft small" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button
                className="btn-black small"
                disabled={!form.name || !form.cron || !form.prompt}
                onClick={async () => {
                  await api.post("/api/routines", { ...form, botId: bot.id });
                  setAdding(false);
                  setForm({ name: "", cron: SCHEDULES[0]![1], prompt: "" });
                  load();
                }}
              >
                Add routine
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-soft small add" onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} /> Add routine
          </button>
        )}
      </div>
    </div>
  );
}
