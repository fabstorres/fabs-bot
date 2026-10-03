import { useState } from "react";
import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { Bot, Message, MessagePart } from "../../../shared/types";
import { api, formatSize, formatTime } from "../api";
import { openModal } from "../store";
import { BotAvatar } from "./BotAvatar";
import { Icon } from "./Icon";

type ToolPart = Extract<MessagePart, { type: "tool" }>;

/** Consecutive tool calls collapse into one work log. */
function groupParts(parts: MessagePart[]) {
  const out: ({ kind: "tools"; tools: ToolPart[] } | { kind: "part"; part: MessagePart; index: number })[] = [];
  parts.forEach((p, index) => {
    if (p.type === "tool") {
      const last = out[out.length - 1];
      if (last?.kind === "tools") last.tools.push(p);
      else out.push({ kind: "tools", tools: [p] });
    } else if (p.type !== "text" || p.text.trim()) out.push({ kind: "part", part: p, index });
  });
  return out;
}

export function MessageList({ messages, bots, multi }: { messages: Message[]; bots: Bot[]; multi: boolean }) {
  return (
    <>
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const showAuthor = m.author === "bot" && (multi || prev?.author !== "bot" || prev.botId !== m.botId);
        const gap = prev && (prev.author !== m.author || prev.botId !== m.botId);
        return <MessageView key={m.id} m={m} bot={bots.find((b) => b.id === m.botId)} showAuthor={showAuthor && multi} gap={!!gap} />;
      })}
    </>
  );
}

function MessageView({ m, bot, showAuthor, gap }: { m: Message; bot?: Bot; showAuthor: boolean; gap: boolean }) {
  if (m.author === "system") {
    return <div className="msg-system">{m.parts.map((p) => (p.type === "text" ? p.text.split("\n")[0] : "")).join(" ")}</div>;
  }
  const mine = m.author === "user";
  const groups = groupParts(m.parts);
  const empty = groups.length === 0;
  return (
    <div
      className={`msg ${mine ? "msg-user" : "msg-bot"} ${gap ? "gap" : ""} ${m.status === "error" ? "msg-error" : ""}`}
      data-author={mine ? "user" : (bot?.name ?? "bot")}
      data-status={m.status}
    >
      {showAuthor && bot && (
        <div className="msg-author">
          <BotAvatar shape={bot.shape} color={bot.color} size={20} />
          <span>{bot.name}</span>
          <time>{formatTime(m.createdAt)}</time>
        </div>
      )}
      {groups.map((g, i) =>
        g.kind === "tools" ? (
          <WorkLog key={i} tools={g.tools} live={m.status === "streaming" && i === groups.length - 1} />
        ) : (
          <Part key={i} part={g.part} index={g.index} message={m} />
        ),
      )}
      {m.status === "streaming" && (empty || groups[groups.length - 1]?.kind !== "part") && (
        <div className="bubble typing-bubble">
          <span className="typing"><i /><i /><i /></span>
        </div>
      )}
    </div>
  );
}

function Part({ part, index, message }: { part: MessagePart; index: number; message: Message }) {
  switch (part.type) {
    case "text":
      return (
        <div className="bubble">
          <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>
            {part.text}
          </Markdown>
        </div>
      );
    case "file":
      return <FileChip fileId={part.fileId} name={part.name} size={part.size} />;
    case "question":
      return <QuestionCard part={part} index={index} message={message} />;
    case "approval":
      return <ApprovalCard part={part} />;
    default:
      return null;
  }
}

function WorkLog({ tools, live }: { tools: ToolPart[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  const running = tools.find((t) => t.status === "running");
  const errors = tools.filter((t) => t.status === "error").length;
  const label = running
    ? `${running.name}${running.summary ? ` · ${running.summary}` : ""}`
    : `${tools.length} step${tools.length > 1 ? "s" : ""}${errors ? ` · ${errors} failed` : ""}`;
  return (
    <div className={`worklog ${open ? "open" : ""}`} role="group" aria-label="Work log">
      <button className="worklog-head" onClick={() => setOpen(!open)}>
        <span className={`worklog-dot ${running && live ? "live" : errors ? "err" : ""}`} />
        <span className="worklog-label">{label}</span>
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <ol>
          {tools.map((t) => (
            <li key={t.id} className={`tool-${t.status}`}>
              <span className="tool-name">{t.name}</span>
              <span className="tool-summary">{t.summary}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function FileChip({ fileId, name, size }: { fileId: string; name: string; size: number }) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const badge = ext === ".md" ? "M↓" : ext.slice(1, 4).toUpperCase() || "FILE";
  return (
    <button className="file-chip" aria-label={`File ${name}`} onClick={() => openModal({ kind: "file", url: `/files/${fileId}`, name })}>
      <span className="file-badge">{badge}</span>
      <span className="file-meta">
        <span className="file-name">
          {base}
          <span className="file-ext">{ext}</span>
        </span>
        <span className="file-size">{formatSize(size)}</span>
      </span>
    </button>
  );
}

function QuestionCard({ part, index, message }: { part: Extract<MessagePart, { type: "question" }>; index: number; message: Message }) {
  const [busy, setBusy] = useState(false);
  const answered = part.answered !== undefined;
  return (
    <div className="question" role="group" aria-label={`Question: ${part.question}`}>
      <div className="question-q">{part.question}</div>
      <div className="question-options">
        {part.options.map((o, i) => (
          <button
            key={i}
            disabled={answered || busy}
            className={answered ? (part.answered === i ? "chosen" : "dim") : ""}
            onClick={async () => {
              setBusy(true);
              await api.post(`/api/messages/${message.id}/answer`, { partIndex: index, option: i }).finally(() => setBusy(false));
            }}
          >
            <span className="letter">{String.fromCharCode(65 + i)}</span>
            <span>{o}</span>
            {part.answered === i && <Icon name="check" size={16} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function ApprovalCard({ part }: { part: Extract<MessagePart, { type: "approval" }> }) {
  const [busy, setBusy] = useState(false);
  const decide = (decision: "allow" | "deny") => {
    setBusy(true);
    api.post(`/api/approvals/${part.requestId}`, { decision }).catch(() => setBusy(false));
  };
  return (
    <div className={`approval ${part.decision ? `decided-${part.decision}` : "pending"}`} role="group" aria-label={`Approval: ${part.tool}`}>
      <div className="approval-head">
        <Icon name="bolt" size={16} />
        <span>
          Wants to use <b>{part.tool}</b>
        </span>
      </div>
      <pre className="approval-summary">{part.summary}</pre>
      {part.decision ? (
        <div className="approval-result" role="status">{part.decision === "allow" ? "Allowed" : "Denied"}</div>
      ) : (
        <div className="approval-actions">
          <button className="btn-soft" disabled={busy} onClick={() => decide("deny")}>
            Deny
          </button>
          <button className="btn-black" disabled={busy} onClick={() => decide("allow")}>
            Allow
          </button>
        </div>
      )}
    </div>
  );
}
