import { useState } from "react";
import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { Check, ChevronDown, ChevronRight, Download, Zap } from "lucide-react";
import type { Bot, Message, MessagePart } from "../../../shared/types";
import { api, formatSize, formatTime } from "../api";
import { openModal, openNestedThread, useStore } from "../store";
import { BotAvatar } from "./BotAvatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ToolPart = Extract<MessagePart, { type: "tool" }>;

/** The teammate a message_bot call went to, read from its "<Name>: <message>" summary. */
const exchangeTarget = (p: ToolPart, bots: Bot[]) => (/message_bot$/.test(p.name) ? bots.find((b) => p.summary.startsWith(`${b.name}: `)) : undefined);

/** Consecutive tool calls collapse into one work log; messages to a known teammate stand on their own. */
function groupParts(parts: MessagePart[], bots: Bot[]) {
  const out: ({ kind: "tools"; tools: ToolPart[] } | { kind: "part"; part: MessagePart; index: number })[] = [];
  parts.forEach((p, index) => {
    if (p.type === "tool" && !exchangeTarget(p, bots)) {
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
        return <MessageView key={m.id} m={m} bots={bots} showAuthor={showAuthor && multi} gap={!!gap} />;
      })}
    </>
  );
}

function MessageView({ m, bots, showAuthor, gap }: { m: Message; bots: Bot[]; showAuthor: boolean; gap: boolean }) {
  if (m.author === "system") {
    return (
      <p className="self-center py-1 text-center text-[13px] text-muted-foreground">
        {m.parts.map((p) => (p.type === "text" ? p.text.split("\n")[0] : "")).join(" ")}
      </p>
    );
  }
  const mine = m.author === "user";
  const bot = bots.find((b) => b.id === m.botId);
  const groups = groupParts(m.parts, bots);
  const empty = groups.length === 0;
  return (
    <div
      className={cn("flex flex-col gap-1.5 animate-in fade-in-0 slide-in-from-bottom-1", mine ? "items-end" : "items-start", gap && "mt-3")}
      data-author={mine ? "user" : (bot?.name ?? "bot")}
      data-status={m.status}
    >
      {showAuthor && bot && (
        <div className="ml-1 flex items-center gap-1.5 text-[13px] font-semibold">
          <BotAvatar shape={bot.shape} color={bot.color} size={20} />
          <span>{bot.name}</span>
          <time className="font-normal text-muted-foreground">{formatTime(m.createdAt)}</time>
        </div>
      )}
      {groups.map((g, i) =>
        g.kind === "tools" ? (
          <WorkLog key={i} tools={g.tools} live={m.status === "streaming" && i === groups.length - 1} />
        ) : (
          <Part key={i} part={g.part} index={g.index} message={m} bot={bot} error={m.status === "error" && i === groups.length - 1} />
        ),
      )}
      {m.status === "streaming" && (empty || groups[groups.length - 1]?.kind !== "part") && (
        <div className="rounded-3xl bg-bubble px-[18px] py-4 text-muted-foreground">
          <span className="typing">
            <i />
            <i />
            <i />
          </span>
        </div>
      )}
    </div>
  );
}

function Part({ part, index, message, bot, error }: { part: MessagePart; index: number; message: Message; bot?: Bot; error: boolean }) {
  switch (part.type) {
    case "text": {
      const mine = message.author === "user";
      return (
        <div
          className={cn(
            "bubble max-w-[88%] rounded-3xl px-[18px] py-3 text-base leading-[1.45] wrap-anywhere",
            mine ? "bubble-user bg-foreground text-background" : "bg-bubble",
            error && "bg-red-50",
          )}
        >
          <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>
            {part.text}
          </Markdown>
        </div>
      );
    }
    case "tool":
      return <Exchange tool={part} from={bot} />;
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

/** A bot messaging a teammate, shown where it happened; opens their private channel. */
function Exchange({ tool, from }: { tool: ToolPart; from?: Bot }) {
  const to = useStore((s) => exchangeTarget(tool, s.bots));
  const threads = useStore((s) => s.threads);
  const openId = useStore((s) => s.openThreadId);
  if (!to) return null;
  const text = tool.summary.slice(to.name.length + 2);
  const found = from && threads.find((t) => t.kind === "backchannel" && t.memberIds.includes(from.id) && t.memberIds.includes(to.id));
  const channel = found && found.id !== openId ? found : undefined;
  const live = tool.status === "running";
  const who = to.name;
  return (
    <button
      aria-label={`Exchange with ${who}`}
      disabled={!channel}
      onClick={() => channel && openNestedThread(channel.id)}
      className="flex w-full max-w-[88%] items-center gap-3 rounded-2xl border bg-background px-3 py-2.5 text-left transition-colors hover:bg-muted/60 disabled:cursor-default md:max-w-md"
    >
      <span className="flex flex-none -space-x-2">
        {from && <BotAvatar shape={from.shape} color={from.color} size={28} />}
        <BotAvatar shape={to.shape} color={to.color} size={28} state={live ? "working" : "idle"} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{live ? `Talking with ${who}…` : `Talked with ${who}`}</span>
        <span className="block truncate text-[13px] text-muted-foreground">{text}</span>
      </span>
      {channel && <ChevronRight className="size-4 flex-none text-muted-foreground" />}
    </button>
  );
}

function WorkLog({ tools, live }: { tools: ToolPart[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  const running = tools.find((t) => t.status === "running");
  const errors = tools.filter((t) => t.status === "error").length;
  const label = running
    ? `${running.name}${running.summary ? ` · ${running.summary}` : ""}`
    : `${tools.length} step${tools.length > 1 ? "s" : ""}${errors ? ` · ${errors} failed` : ""}`;
  return (
    <div className="max-w-[88%] text-[13px] text-muted-foreground" role="group" aria-label="Work log">
      <button className="flex max-w-full items-center gap-2 rounded-full px-2 py-1 hover:bg-muted" onClick={() => setOpen(!open)}>
        <span className={cn("size-1.5 flex-none rounded-full bg-muted-foreground/50", running && live && "animate-pulse bg-working", errors > 0 && !running && "bg-failing")} />
        <span className="truncate">{label}</span>
        <ChevronDown className={cn("size-3.5 flex-none transition-transform", !open && "-rotate-90")} />
      </button>
      {open && (
        <ol className="mt-1 ml-3 flex flex-col gap-1 border-l pl-3">
          {tools.map((t) => (
            <li key={t.id} className={cn("flex min-w-0 gap-2", t.status === "error" && "text-failing")}>
              <span className="flex-none font-medium text-foreground">{t.name}</span>
              <span className="truncate font-mono text-xs leading-5">{t.summary}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function FileChip({ fileId, name, size }: { fileId: string; name: string; size: number }) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1) : "";
  const badge = ext === "md" ? "M↓" : ext.slice(0, 4).toUpperCase() || "FILE";
  return (
    <button
      className="flex w-full max-w-xs items-center gap-3 rounded-2xl border bg-background p-3 text-left transition-colors hover:bg-muted/60"
      aria-label={`File ${name}`}
      onClick={() => openModal({ kind: "file", url: `/files/${fileId}`, name })}
    >
      <span className="grid size-10 flex-none place-items-center rounded-lg bg-red-50 text-[10px] font-bold text-red-600">{badge}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        <span className="block text-[13px] text-muted-foreground">{formatSize(size)}</span>
      </span>
      <Download className="size-4 flex-none text-muted-foreground" />
    </button>
  );
}

function QuestionCard({ part, index, message }: { part: Extract<MessagePart, { type: "question" }>; index: number; message: Message }) {
  const [busy, setBusy] = useState(false);
  const answered = part.answered !== undefined;
  return (
    <div className="w-full max-w-md rounded-3xl border bg-background p-4" role="group" aria-label={`Question: ${part.question}`}>
      <div className="mb-3 font-medium">{part.question}</div>
      <div className="flex flex-col gap-1.5">
        {part.options.map((o, i) => (
          <button
            key={i}
            disabled={answered || busy}
            className={cn(
              "flex items-center gap-3 rounded-2xl bg-muted px-3 py-2.5 text-left transition-colors enabled:hover:bg-accent",
              answered && part.answered === i && "bg-foreground text-background",
              answered && part.answered !== i && "opacity-45",
            )}
            onClick={async () => {
              setBusy(true);
              await api.post(`/api/messages/${message.id}/answer`, { partIndex: index, option: i }).finally(() => setBusy(false));
            }}
          >
            <span className="grid size-6 flex-none place-items-center rounded-full bg-black/8 text-xs font-semibold">{String.fromCharCode(65 + i)}</span>
            <span className="flex-1">{o}</span>
            {part.answered === i && <Check className="size-4" />}
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
    <div
      className={cn("w-full max-w-md rounded-3xl border bg-background p-4", !part.decision && "border-amber-300 bg-amber-50/40")}
      role="group"
      aria-label={`Approval: ${part.tool}`}
    >
      <div className="flex items-center gap-2 text-sm">
        <Zap className="size-4 text-amber-500" />
        <span>
          Wants to use <b>{part.tool}</b>
        </span>
      </div>
      <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-muted p-3 font-mono text-xs whitespace-pre-wrap">{part.summary}</pre>
      {part.decision ? (
        <div className={cn("mt-3 text-sm font-medium", part.decision === "allow" ? "text-green-600" : "text-failing")} role="status">
          {part.decision === "allow" ? "Allowed" : "Denied"}
        </div>
      ) : (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" className="rounded-full" disabled={busy} onClick={() => decide("deny")}>
            Deny
          </Button>
          <Button className="rounded-full" disabled={busy} onClick={() => decide("allow")}>
            Allow
          </Button>
        </div>
      )}
    </div>
  );
}
