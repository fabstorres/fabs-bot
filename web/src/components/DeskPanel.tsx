import { useState } from "react";
import { ChevronRight, Clock, File, Folder, Pause, Play, Settings, X } from "lucide-react";
import type { Bot, Routine, Thread } from "../../../shared/types";
import { api, formatSize, formatTime } from "../api";
import { useLoad } from "../hooks";
import { closePanel, openModal, openNestedThread, openThread, threadTitle, togglePanel, useStore } from "../store";
import { BotAvatar } from "./BotAvatar";
import { scheduleLabel } from "./BotEditor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The bot's side of the conversation: its desk, its routines and its other chats. */
export function DeskPanel({ thread }: { thread: Thread }) {
  const bots = useStore((s) => s.bots);
  const members = thread.memberIds.map((id) => bots.find((b) => b.id === id)).filter((b): b is Bot => !!b);
  const [pickedId, setPickedId] = useState(members[0]?.id);
  const bot = members.find((b) => b.id === pickedId) ?? members[0];
  if (!bot) return null;

  return (
    <aside
      aria-label={`${bot.name}'s desk`}
      className="fixed inset-0 z-40 flex flex-col bg-background animate-in slide-in-from-right-4 md:static md:z-auto md:w-[360px] md:flex-none md:border-l"
    >
      <header className="flex h-14 flex-none items-center gap-1 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {members.length > 1 ? (
            members.map((m) => (
              <button
                key={m.id}
                aria-label={`Show ${m.name}`}
                aria-pressed={m.id === bot.id}
                className={cn("rounded-full p-1", m.id === bot.id && "bg-accent")}
                onClick={() => setPickedId(m.id)}
              >
                <BotAvatar shape={m.shape} color={m.color} size={26} />
              </button>
            ))
          ) : (
            <span className="truncate pl-2 font-semibold">{bot.name}</span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => openModal({ kind: "bot", botId: bot.id })} aria-label={`Edit ${bot.name}`} title="Edit bot">
          <Settings className="size-5" />
        </Button>
        <Button variant="ghost" size="icon" className="rounded-full" onClick={togglePanel} aria-label="Close desk">
          <X className="size-5" />
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <Desk key={bot.id} bot={bot} />
        <Routines bot={bot} />
        <OtherChats bot={bot} openId={thread.id} />
      </div>
    </aside>
  );
}

/** On a phone the desk covers the whole screen, so it has to step aside for the chat you picked. */
const onPhone = () => !window.matchMedia("(min-width: 768px)").matches;

type Entry = { name: string; dir: boolean; size: number; mtime: number; path: string };

function Desk({ bot }: { bot: Bot }) {
  const [path, setPath] = useState("");
  const { data, error } = useLoad(
    () => api.get<{ root: string; path: string; entries: Entry[] }>(`/api/bots/${bot.id}/files?path=${encodeURIComponent(path)}`),
    [bot.id, path],
  );
  const crumbs = path ? path.split("/") : [];
  return (
    <section>
      <div className="overflow-hidden rounded-2xl border bg-muted/40">
        <div className="flex items-center gap-1 overflow-x-auto border-b bg-background px-3 py-2 text-[13px] text-muted-foreground">
          <button className="flex-none hover:text-foreground" title={data?.root} onClick={() => setPath("")}>
            {data?.root.split("/").pop() ?? "…"}
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex flex-none items-center gap-1">
              <ChevronRight className="size-3" />
              <button className="hover:text-foreground" onClick={() => setPath(crumbs.slice(0, i + 1).join("/"))}>
                {c}
              </button>
            </span>
          ))}
        </div>
        <div className="max-h-64 overflow-y-auto p-1.5" role="group" aria-label="Desk files">
          {error && <p className="p-3 text-sm text-failing">{error}</p>}
          {data?.entries.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Empty desk. Files the bot makes show up here.</p>}
          {data?.entries.map((e) => (
            <button
              key={e.path}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-background"
              aria-label={`${e.dir ? "Folder" : "File"} ${e.name}`}
              onClick={() =>
                e.dir ? setPath(e.path) : openModal({ kind: "file", url: `/api/bots/${bot.id}/file?path=${encodeURIComponent(e.path)}`, name: e.name })
              }
            >
              {e.dir ? <Folder className="size-4 flex-none text-sky-600" /> : <File className="size-4 flex-none text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              <span className="flex-none text-xs text-muted-foreground">{e.dir ? "" : formatSize(e.size)}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-center text-[13px] text-muted-foreground">{bot.name}'s desk</p>
    </section>
  );
}

function Routines({ bot }: { bot: Bot }) {
  const modal = useStore((s) => s.modal);
  const list = useLoad(() => api.get<Routine[]>("/api/routines"), [bot.id, modal]).data?.filter((r) => r.botId === bot.id) ?? [];
  return (
    <section className="mt-6">
      <h3 className="mb-2 px-1 text-sm text-muted-foreground">Routines</h3>
      {list.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground">
          None yet. Ask {bot.name} to do something on a schedule, or add one in{" "}
          <button className="underline underline-offset-2" onClick={() => openModal({ kind: "bot", botId: bot.id })}>
            settings
          </button>
          .
        </p>
      )}
      {list.map((r) => (
        <div key={r.id} className="group flex items-start gap-3 rounded-xl px-1 py-2" role="group" aria-label={`Routine ${r.name}`}>
          {r.enabled ? <Clock className="mt-0.5 size-4 flex-none text-green-600" /> : <Pause className="mt-0.5 size-4 flex-none text-muted-foreground" />}
          <div className="min-w-0 flex-1">
            <div className="truncate">{r.name}</div>
            <div className="text-sm text-muted-foreground">{r.enabled ? scheduleLabel(r.cron) : "Paused"}</div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => api.post(`/api/routines/${r.id}/run`)}
            aria-label={`Run ${r.name} now`}
            title="Run now"
          >
            <Play className="size-3.5" />
          </Button>
        </div>
      ))}
    </section>
  );
}

function OtherChats({ bot, openId }: { bot: Bot; openId: string }) {
  const bots = useStore((s) => s.bots);
  const others = useStore((s) => s.threads).filter((t) => t.id !== openId && t.memberIds.includes(bot.id));
  if (!others.length) return null;
  return (
    <section className="mt-6">
      <h3 className="mb-1 px-1 text-sm text-muted-foreground">Chats</h3>
      {others.map((t) => (
        <button
          key={t.id}
          className="flex w-full items-center gap-2 rounded-xl px-1 py-2 text-left hover:bg-muted"
          onClick={() => {
            if (t.kind === "backchannel") openNestedThread(t.id);
            else openThread(t.id);
            if (onPhone()) closePanel();
          }}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{threadTitle(t, bots)}</span>
            <span className="block truncate text-[13px] text-muted-foreground">{t.preview}</span>
          </span>
          <span className="flex-none text-xs text-muted-foreground">{formatTime(t.updatedAt)}</span>
        </button>
      ))}
    </section>
  );
}
