import { useState } from "react";
import type { Thread } from "../../shared/types";
import { api } from "./api";
import { useLoad, useWindowEvent } from "./hooks";
import { openDirect, openModal, openThread, selectBot, useStore } from "./store";
import { BotAvatar } from "./components/BotAvatar";
import { BotEditor } from "./components/BotEditor";
import { Field } from "./components/Field";
import { Icon } from "./components/Icon";
import { Inbox, SearchButton } from "./components/Inbox";
import { MentionInput, mentionedBots } from "./components/MentionInput";
import { ConnectorsPanel, FileViewer, SettingsPanel, WorkspacePanel } from "./components/Panels";
import { ThreadSheet } from "./components/ThreadSheet";

export function App() {
  const loaded = useStore((s) => s.loaded);
  const unpaired = useStore((s) => s.unpaired);
  const serverDown = useStore((s) => s.serverDown);
  const bots = useStore((s) => s.bots);
  const openId = useStore((s) => s.openThreadId);
  const thread = useStore((s) => s.threads.find((t) => t.id === s.openThreadId));
  const modal = useStore((s) => s.modal);

  useWindowEvent("popstate", () => openThread(null));

  if (unpaired) return <Unpaired />;
  if (!loaded && serverDown) return <ServerDown />;
  if (!loaded) return <div className="boot"><BotAvatar shape="drop" color="#FF5A00" size={64} state="working" /></div>;

  return (
    <div className={`app ${openId ? "has-sheet" : ""}`}>
      {bots.length === 0 ? (
        <Welcome />
      ) : (
        <>
          <TopBar />
          <main className="stage" aria-label="Field">
            <div className="field-wrap">
              <Field />
              <BotStrip />
              <Dock />
            </div>
            <Inbox />
            {thread && <ThreadSheet key={thread.id} thread={thread} />}
          </main>
        </>
      )}
      {modal?.kind === "bot" && <BotEditor botId={modal.botId} onboarding={modal.onboarding} />}
      {modal?.kind === "settings" && <SettingsPanel />}
      {modal?.kind === "connectors" && <ConnectorsPanel />}
      {modal?.kind === "workspace" && <WorkspacePanel botId={modal.botId} />}
      {modal?.kind === "file" && <FileViewer url={modal.url} name={modal.name} />}
    </div>
  );
}

function TopBar() {
  const connected = useStore((s) => s.connected);
  const statuses = useStore((s) => s.statuses);
  const busy = Object.values(statuses).filter((s) => s.state === "working").length;
  const host = useLoad(() => api.get<{ hostname: string }>("/api/host"), []).data?.hostname ?? "";

  return (
    <header className="topbar">
      <button className="host-chip" onClick={() => openModal({ kind: "settings" })} title="This PC & devices" aria-label="This PC">
        <span className="host-initial">{(host || "pc").slice(0, 2).toUpperCase()}</span>
        <span className="host-text">
          <b>{host || "…"}</b>
          <small>
            <i className={`led ${connected ? "on" : ""}`} />
            {connected ? (busy ? `${busy} bot${busy > 1 ? "s" : ""} working` : "All quiet") : "Reconnecting…"}
          </small>
        </span>
      </button>
      <div className="brand">
        Fabs<span>Bot</span>
      </div>
      <div className="topbar-actions">
        <SearchButton />
        <button className="round" onClick={() => openModal({ kind: "connectors" })} title="Connectors" aria-label="Connectors">
          <Icon name="plug" />
        </button>
        <button className="round" onClick={() => openModal({ kind: "bot", onboarding: true })} title="New bot" aria-label="New bot">
          <Icon name="plus" />
        </button>
      </div>
    </header>
  );
}

/** Phone layout: the field collapses into a scrollable strip. */
function BotStrip() {
  const bots = useStore((s) => s.bots);
  const statuses = useStore((s) => s.statuses);
  return (
    <nav className="bot-strip" aria-label="Bots">
      {bots.map((b) => {
        const st = statuses[b.id];
        return (
          <button key={b.id} className="strip-bot" aria-label={`Chat with ${b.name}`} onClick={() => void openDirect(b.id)}>
            <BotAvatar shape={b.shape} color={b.color} size={58} state={st?.state} dot />
            <span>{b.name}</span>
            {st?.state !== "idle" && st?.text && <small>{st.text}</small>}
          </button>
        );
      })}
      <button className="strip-bot add" aria-label="New bot" onClick={() => openModal({ kind: "bot", onboarding: true })}>
        <span className="strip-add">
          <Icon name="plus" size={26} />
        </span>
        <span>New</span>
      </button>
    </nav>
  );
}

/** Start a new thread with whoever you @mention. */
function Dock() {
  const bots = useStore((s) => s.bots);
  const [text, setText] = useState("");
  const [hint, setHint] = useState("");
  const targets = mentionedBots(text, bots);
  const recipients = targets.length ? targets : bots.length === 1 ? bots : [];

  async function send() {
    if (!text.trim()) return;
    if (!recipients.length) {
      setHint("Type @ to pick who should take this.");
      return;
    }
    const t = await api.post<Thread>("/api/threads", { botIds: recipients.map((b) => b.id), text });
    setText("");
    setHint("");
    openThread(t.id);
  }

  return (
    <div className="dock" role="region" aria-label="Dock" onPointerDown={() => selectBot(null)}>
      {hint && <div className="dock-hint" role="status">{hint}</div>}
      <div className="dock-pill">
        <span className="dock-to">
          {recipients.length ? (
            recipients.slice(0, 3).map((b) => <BotAvatar key={b.id} shape={b.shape} color={b.color} size={26} />)
          ) : (
            <span className="dock-at">@</span>
          )}
        </span>
        <MentionInput
          value={text}
          onChange={(v) => (setText(v), setHint(""))}
          onSubmit={send}
          bots={bots}
          ariaLabel="Hand off work"
          placeholder={bots.length === 1 ? `Give ${bots[0]!.name} something to do` : "Hand off work: @Chief prep my week…"}
        />
        <button className="send" onClick={send} disabled={!text.trim()} aria-label="Start thread">
          <Icon name="send" size={18} stroke={2.4} />
        </button>
      </div>
    </div>
  );
}

const DRIFT = [
  { t: 0, x: 14, y: 16, s: 120, r: -8 },
  { t: 3, x: 62, y: 14, s: 96, r: 6 },
  { t: 1, x: 92, y: 34, s: 110, r: 0 },
  { t: 5, x: 2, y: 40, s: 104, r: 10 },
  { t: 4, x: 94, y: 56, s: 120, r: -6 },
  { t: 2, x: 4, y: 64, s: 130, r: 0 },
  { t: 0, x: 88, y: 80, s: 96, r: 0 },
  { t: 4, x: 16, y: 84, s: 110, r: 6 },
  { t: 1, x: 50, y: 86, s: 120, r: -4 },
];
const DRIFT_SHAPES = ["cloud", "blob", "egg", "drop", "hex", "square", "bean", "pill", "triangle"] as const;
const DRIFT_COLORS = ["#00C060", "#FF2E93", "#8A5530", "#7B3FF2", "#FF2238", "#FF9500", "#00B39A", "#1478FF", "#FF5A00"];

function Welcome() {
  return (
    <div className="welcome">
      {DRIFT.map((d, i) => (
        <div
          key={i}
          className="drifter"
          style={{ left: `${d.x}%`, top: `${d.y}%`, animationDelay: `${-i * 1.7}s`, ["--r" as string]: `${d.r}deg` }}
        >
          <BotAvatar shape={DRIFT_SHAPES[i]!} color={DRIFT_COLORS[i]!} size={d.s} />
        </div>
      ))}
      <div className="welcome-center">
        <h1>Fabs Bot</h1>
        <p>Your team of always-on agents that work from this PC and finish the work.</p>
      </div>
      <div className="welcome-cta">
        <button className="btn-black big" onClick={() => openModal({ kind: "bot", onboarding: true })}>
          Meet your first bot
        </button>
        <button className="link" onClick={() => openModal({ kind: "settings" })}>
          Pair a phone first
        </button>
      </div>
    </div>
  );
}

function ServerDown() {
  return (
    <div className="welcome unpaired">
      <div className="welcome-center">
        <BotAvatar shape="drop" color="#FF5A00" size={120} state="error" />
        <h1>Can't reach Fabs Bot</h1>
        <p>
          The Fabs Bot server on your PC isn't answering. Start it with <code>bun run dev</code> (or <code>bun run start</code>).
          This page reconnects on its own.
        </p>
      </div>
    </div>
  );
}

function Unpaired() {
  return (
    <div className="welcome unpaired">
      <div className="welcome-center">
        <BotAvatar shape="square" color="#7A7A7A" size={120} state="waiting" />
        <h1>Not paired yet</h1>
        <p>
          On your PC, open Fabs Bot → tap the PC name in the top-left → scan the QR code with this device. Both need to be on your
          Tailscale network.
        </p>
      </div>
    </div>
  );
}
