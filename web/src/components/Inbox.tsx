import { formatTime } from "../api";
import { openThread, threadTitle, useStore } from "../store";
import { AvatarStack } from "./BotAvatar";
import { Icon } from "./Icon";

export function Inbox() {
  const threads = useStore((s) => s.threads);
  const bots = useStore((s) => s.bots);
  const statuses = useStore((s) => s.statuses);
  const filter = useStore((s) => s.inboxFilter);
  const search = useStore((s) => s.search);
  const openId = useStore((s) => s.openThreadId);

  const needs = threads.filter((t) => t.needsYou);
  const q = search.trim().toLowerCase();
  const shown = threads
    .filter((t) => (filter === "bots" ? t.kind === "backchannel" : filter === "needs" ? t.needsYou : t.kind !== "backchannel"))
    .filter((t) => !q || `${threadTitle(t, bots)} ${t.topic} ${t.preview}`.toLowerCase().includes(q));

  return (
    <aside className="inbox" aria-label="Inbox">
      <div className="inbox-head">
        <h2>Inbox</h2>
        <div className="seg" role="tablist" aria-label="Inbox filter">
          {(
            [
              ["all", "Threads"],
              ["needs", `Needs you${needs.length ? ` · ${needs.length}` : ""}`],
              ["bots", "Bot ↔ bot"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => useStore.setState({ inboxFilter: k })}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="inbox-list" role="group" aria-label="Threads">
        {shown.length === 0 && (
          <div className="inbox-empty">
            {filter === "needs" ? "Nobody's waiting on you." : filter === "bots" ? "Bots haven't talked to each other yet." : "No threads yet. Say hi to a bot."}
          </div>
        )}
        {shown.map((t, i) => {
          const members = t.memberIds.map((id) => bots.find((b) => b.id === id)).filter(Boolean) as typeof bots;
          const working = t.memberIds.some((id) => statuses[id]?.state === "working" && statuses[id]?.threadId === t.id);
          const waiting = t.needsYou;
          return (
            <button
              key={t.id}
              aria-label={`Thread: ${threadTitle(t, bots)}`}
              data-thread-id={t.id}
              className={`thread-row ${openId === t.id ? "open" : ""} ${t.unread ? "unread" : ""}`}
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              onClick={() => openThread(t.id)}
            >
              <span className="thread-avatar">
                <AvatarStack bots={members} size={46} />
                {(working || waiting) && <i className={`presence presence-${waiting ? "waiting" : "working"}`} />}
              </span>
              <span className="thread-main">
                <span className="thread-line">
                  <span className="thread-title">{threadTitle(t, bots)}</span>
                  {t.topic && <span className="topic">{t.topic}</span>}
                  <span className="thread-time">{formatTime(t.updatedAt)}</span>
                </span>
                <span className="thread-preview">
                  {working ? <span className="typing"><i /><i /><i /></span> : t.preview || " "}
                </span>
              </span>
              {t.unread > 0 && <span className="unread-dot" />}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export function SearchButton() {
  const search = useStore((s) => s.search);
  return (
    <label className={`search-pill ${search ? "has" : ""}`}>
      <Icon name="search" size={19} />
      <input
        value={search}
        placeholder="Search threads"
        aria-label="Search threads"
        onChange={(e) => useStore.setState({ search: e.target.value })}
      />
    </label>
  );
}
