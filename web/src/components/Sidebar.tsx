import type { ReactNode } from "react";
import { Monitor, Plug, Plus, Search, Settings, SquareTerminal } from "lucide-react";
import type { Bot, Thread } from "../../../shared/types";
import { formatTime } from "../api";
import { openDirect, openModal, openNestedThread, openThread, startCreating, threadTitle, useStore } from "../store";
import { AvatarStack, BotAvatar, LiveAvatar } from "./BotAvatar";
import { PcMenu } from "./PcMenu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Row = { kind: "bot"; bot: Bot; threads: Thread[]; pending?: Thread; at: number } | { kind: "group"; thread: Thread; at: number };

const isDirectWith = (t: Thread, botId: string) => t.kind === "direct" && t.memberIds.length === 1 && t.memberIds[0] === botId;

/**
 * One row per bot (its direct chats rolled up) plus one per group chat, most recent first.
 * Backchannels have no row, so a question waiting in one is surfaced on both bots' rows.
 */
function useRows(): Row[] {
  const bots = useStore((s) => s.bots);
  const threads = useStore((s) => s.threads);
  const search = useStore((s) => s.search).trim().toLowerCase();
  const rows: Row[] = [
    ...bots.map((bot) => {
      const mine = threads.filter((t) => isDirectWith(t, bot.id));
      const pending = threads.find((t) => t.needsYou && t.memberIds.includes(bot.id) && (t.kind === "backchannel" || isDirectWith(t, bot.id)));
      return { kind: "bot" as const, bot, threads: mine, pending, at: Math.max(mine[0]?.updatedAt ?? bot.createdAt, pending?.updatedAt ?? 0) };
    }),
    ...threads.filter((t) => t.kind === "group").map((thread) => ({ kind: "group" as const, thread, at: thread.updatedAt })),
  ];
  return rows
    .filter((r) => {
      if (!search) return true;
      const text = r.kind === "bot" ? `${r.bot.name} ${r.bot.label} ${r.bot.role} ${r.threads[0]?.preview ?? ""}` : `${threadTitle(r.thread, bots)} ${r.thread.preview}`;
      return text.toLowerCase().includes(search);
    })
    .sort((a, b) => b.at - a.at);
}

export function Sidebar() {
  const bots = useStore((s) => s.bots);
  const creating = useStore((s) => s.creating);
  const search = useStore((s) => s.search);
  const rows = useRows();

  return (
    <aside aria-label="Bots" className="flex h-full w-full flex-col bg-sidebar md:w-80 md:border-r md:border-sidebar-border">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2">
        <h1 className="flex-1 text-lg font-semibold tracking-tight md:sr-only">Fabs Bot</h1>
        <PcMenu />
        <SettingsMenu />
        <Button variant="ghost" size="icon" className="rounded-full" onClick={startCreating} aria-label="New bot" title="New bot">
          <Plus className="size-5" />
        </Button>
      </div>
      {bots.length > 0 && (
        <label className="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2 text-muted-foreground transition-[color,box-shadow] focus-within:bg-black/7 focus-within:ring-[3px] focus-within:ring-ring/50">
          <Search className="size-4" />
          <input
            value={search}
            placeholder="Search"
            aria-label="Search bots"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            onChange={(e) => useStore.setState({ search: e.target.value })}
          />
        </label>
      )}
      {bots.length > 0 && !search && <Favorites bots={bots.slice(0, 3)} />}

      <nav aria-label="Chats" className="flex-1 overflow-y-auto px-2 pb-2">
        {bots.length === 0 && (
          <>
            <div className="flex items-center gap-3 rounded-2xl bg-sidebar-accent px-3 py-3">
              <BotAvatar shape="blob" color="#1478FF" size={44} />
              <span className="font-medium">Create your first Bot</span>
            </div>
            <p className="mt-24 text-center text-muted-foreground">No chats yet</p>
          </>
        )}
        {creating && bots.length > 0 && (
          <div className="flex items-center gap-3 rounded-2xl bg-sidebar-accent px-3 py-3">
            <BotAvatar shape="blob" color="#CFCFCA" size={44} />
            <span className="font-medium">New Bot</span>
          </div>
        )}
        {rows.map((r) =>
          r.kind === "bot" ? <BotRow key={r.bot.id} bot={r.bot} threads={r.threads} pending={r.pending} /> : <GroupRow key={r.thread.id} thread={r.thread} />,
        )}
        {search && rows.length === 0 && <p className="mt-10 text-center text-sm text-muted-foreground">Nothing matches "{search}".</p>}
      </nav>
    </aside>
  );
}

function SettingsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Settings" title="Settings">
          <Settings className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => openModal({ kind: "connectors" })}>
          <Plug /> Plugins
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openModal({ kind: "providers" })}>
          <SquareTerminal /> Providers
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openModal({ kind: "settings" })}>
          <Monitor /> This PC
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Phone only: the first few bots as big tappable faces, like the Grok Bot home. */
function Favorites({ bots }: { bots: Bot[] }) {
  return (
    <div className="flex justify-around px-4 pt-2 pb-4 md:hidden">
      {bots.map((b) => (
        <button key={b.id} className="flex w-24 flex-col items-center gap-1.5" onClick={() => void openDirect(b.id)} aria-label={`Open ${b.name}`}>
          <LiveAvatar bot={b} size={68} />
          <span className="w-full truncate text-center text-[13px] text-muted-foreground">{b.name}</span>
        </button>
      ))}
    </div>
  );
}

function RowShell({
  active,
  label,
  onClick,
  avatar,
  title,
  tag,
  time,
  preview,
  flag,
  threadId,
}: {
  active: boolean;
  label: string;
  onClick(): void;
  avatar: ReactNode;
  title: string;
  tag?: string;
  time: string;
  preview: ReactNode;
  flag: "needs" | "unread" | null;
  threadId?: string;
}) {
  return (
    <button
      aria-label={label}
      aria-current={active ? "page" : undefined}
      data-thread-id={threadId}
      onClick={onClick}
      className={cn("flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent/60", active && "bg-sidebar-accent hover:bg-sidebar-accent")}
    >
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <span className="max-w-full flex-none truncate font-semibold">{title}</span>
            {tag && (
              <Badge variant="secondary" className="block min-w-0 truncate rounded-md px-1.5 font-normal text-muted-foreground">
                {tag}
              </Badge>
            )}
          </span>
          <span className="flex-none text-[13px] text-muted-foreground">{time}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{preview}</span>
          {flag && (
            <span
              className={cn("size-2.5 flex-none rounded-full", flag === "needs" ? "bg-waiting" : "bg-blue-500")}
              role="img"
              aria-label={flag === "needs" ? "Needs you" : "Unread"}
            />
          )}
        </span>
      </span>
    </button>
  );
}

function BotRow({ bot, threads, pending }: { bot: Bot; threads: Thread[]; pending?: Thread }) {
  const status = useStore((s) => s.statuses[bot.id]);
  const open = useStore((s) => s.threads.find((t) => t.id === s.openThreadId));
  const bots = useStore((s) => s.bots);
  const latest = threads[0];
  const busy = status && status.state !== "idle" && status.text;
  return (
    <RowShell
      label={`Bot ${bot.name}`}
      active={!!open && isDirectWith(open, bot.id)}
      onClick={() => {
        if (pending?.kind === "backchannel") openNestedThread(pending.id);
        else if (pending) openThread(pending.id);
        else void openDirect(bot.id);
      }}
      avatar={<LiveAvatar bot={bot} size={44} />}
      title={bot.name}
      tag={bot.label}
      time={latest ? formatTime(latest.updatedAt) : ""}
      preview={
        busy ? (
          <span className={status.state === "blocked" ? "text-amber-600" : undefined}>{status.text}</span>
        ) : pending?.kind === "backchannel" ? (
          <span className="text-amber-600">Waiting for you in {threadTitle(pending, bots)}</span>
        ) : (
          latest?.preview || bot.role
        )
      }
      flag={pending ? "needs" : threads.some((t) => t.unread > 0) ? "unread" : null}
    />
  );
}

function GroupRow({ thread }: { thread: Thread }) {
  const bots = useStore((s) => s.bots);
  const openId = useStore((s) => s.openThreadId);
  const members = thread.memberIds.map((id) => bots.find((b) => b.id === id)).filter((b): b is Bot => !!b);
  return (
    <RowShell
      label={`Thread: ${threadTitle(thread, bots)}`}
      threadId={thread.id}
      active={openId === thread.id}
      onClick={() => openThread(thread.id)}
      avatar={<AvatarStack bots={members} size={44} />}
      title={threadTitle(thread, bots)}
      time={formatTime(thread.updatedAt)}
      preview={thread.preview}
      flag={thread.needsYou ? "needs" : thread.unread > 0 ? "unread" : null}
    />
  );
}
