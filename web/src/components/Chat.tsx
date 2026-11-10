import { type RefObject, useId, useRef, useState } from "react";
import { ArrowUp, ChevronLeft, Ellipsis, LoaderCircle, Mic, Monitor, Paperclip, Pencil, Square, Trash2, UserPlus, X } from "lucide-react";
import { mentionedBots } from "../../../shared/mentions";
import type { Bot, Thread } from "../../../shared/types";
import { api, isImage } from "../api";
import { toast } from "sonner";
import { attachFiles, enterThread, goBack, isConnected, openModal, threadTitle, togglePanel, updateAttachments, useStore, usingScreen } from "../store";
import { useNow } from "../hooks";
import { accentStyle, useTheme } from "../theme";
import { AvatarStack, BotAvatar, LiveAvatar } from "./BotAvatar";
import { MentionInput, type MentionInputHandle } from "./MentionInput";
import { MessageList } from "./Messages";
import { Modal } from "./Modal";
import { OfflineBanner } from "./OfflineBanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WindowControls } from "./WindowControls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function Chat({ thread, side = false }: { thread: Thread; side?: boolean }) {
  const bots = useStore((s) => s.bots);
  const messages = useStore((s) => s.messages[thread.id]);
  const accent = useTheme((s) => s.accent);
  const members = thread.memberIds.map((id) => bots.find((b) => b.id === id)).filter((b): b is Bot => !!b);

  const working = !!messages?.some((m) => m.status === "streaming");
  const multi = members.length > 1 || thread.kind === "backchannel";
  const title = threadTitle(thread, bots);
  const tint = accent === "bot" && thread.kind === "direct" && members[0] ? accentStyle(members[0].color) : undefined;

  return (
    <section
      className={cn("flex h-full min-w-0 flex-1 flex-col bg-background", side && "md:w-[360px] md:flex-none md:border-l")}
      style={tint}
      role="region"
      aria-label={`Thread with ${title}`}
      data-thread-id={thread.id}
      data-accent={tint ? "bot" : undefined}
    >
      <header className="window-drag max-md:traffic-lights-space flex h-14 flex-none items-center gap-2 px-3 md:px-5">
        <WindowControls className="md:hidden" />
        <Button variant="ghost" size="icon" className={cn("rounded-full", thread.kind !== "backchannel" && "md:hidden")} onClick={goBack} aria-label="Back">
          <ChevronLeft className="size-5" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {members.length === 1 ? <LiveAvatar bot={members[0]!} size={28} /> : <AvatarStack bots={members} size={28} />}
          <span className="truncate text-[17px] font-semibold">{title}</span>
          {thread.topic && <Badge variant="secondary">{thread.topic}</Badge>}
        </div>
        {members.length > 0 && thread.kind !== "backchannel" && !side && <DeskButton members={members} />}
        <ThreadMenu thread={thread} members={members} />
      </header>

      <div className="flex flex-1 flex-col-reverse overflow-y-auto px-4 pt-4 pb-5" role="log" aria-label="Conversation">
        <div className="mx-auto flex w-full max-w-3xl flex-[1_0_auto] flex-col gap-2">
          {thread.kind === "backchannel" && (
            <p className="py-2 text-center text-[13px] text-muted-foreground">
              Private channel between {members.map((m) => m.name).join(" and ")}. You can read along or step in.
            </p>
          )}
          {!messages && (
            <div className="m-auto text-muted-foreground">
              <span className="typing">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}
          {messages && messages.length === 0 && members[0] && <Hello members={members} title={title} />}
          {messages && <MessageList messages={messages} bots={bots} multi={multi} />}
        </div>
      </div>

      <Composer thread={thread} members={members} working={working} />
    </section>
  );
}

function DeskButton({ members }: { members: Bot[] }) {
  const panelOpen = useStore((s) => s.panelOpen);
  const screens = useStore((s) => s.screens);
  const now = useNow(5_000);
  const busy = members.find((m) => usingScreen(screens[m.id], now));
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("relative rounded-full", panelOpen && "bg-accent")}
      title={busy ? `${busy.name} is using its screen` : "Open the bot's desk and routines"}
      id="open-desk"
      aria-label="Open desk"
      aria-pressed={panelOpen}
      onClick={togglePanel}
    >
      <Monitor className="size-5" />
      {busy && (
        <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full ring-2 ring-background" style={{ background: busy.color }} role="img" aria-label={`${busy.name} is using its screen`} />
      )}
    </Button>
  );
}

function Hello({ members, title }: { members: Bot[]; title: string }) {
  const solo = members.length === 1 ? members[0] : undefined;
  return (
    <div className="m-auto flex flex-col items-center gap-2 py-10 text-center">
      <AvatarStack bots={members} size={112} />
      <h3 className="mt-2 text-xl font-semibold">{solo?.name ?? title}</h3>
      {solo && <p className="max-w-sm text-muted-foreground">{solo.role || "Ready when you are."}</p>}
    </div>
  );
}

function ThreadMenu({ thread, members }: { thread: Thread; members: Bot[] }) {
  const bots = useStore((s) => s.bots);
  const others = bots.filter((b) => !thread.memberIds.includes(b.id));
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const more = useRef<HTMLButtonElement>(null);

  async function bringIn(botId: string) {
    const t = await api.post<Thread>(`/api/threads/${thread.id}/members`, { botId });
    if (t.id !== thread.id) enterThread(t);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={more} variant="ghost" size="icon" className="rounded-full" aria-label="More">
          <Ellipsis className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" aria-label="Thread menu">
        <DropdownMenuItem onSelect={() => setRenaming(true)}>
          <Pencil /> Rename
        </DropdownMenuItem>
        {others.length > 0 && thread.kind !== "backchannel" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <UserPlus /> Bring in a bot
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {others.map((b) => (
                <DropdownMenuItem key={b.id} onSelect={() => void bringIn(b.id)}>
                  <BotAvatar shape={b.shape} color={b.color} size={18} /> {b.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {members.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => openModal({ kind: "bot", botId: m.id })}>
            <BotAvatar shape={m.shape} color={m.color} size={16} /> Edit {m.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
          <Trash2 /> Delete thread
        </DropdownMenuItem>
      </DropdownMenuContent>
      {renaming && <RenameThread thread={thread} trigger={more} onClose={() => setRenaming(false)} />}
      {deleting && <DeleteThread thread={thread} members={members} trigger={more} onClose={() => setDeleting(false)} />}
    </DropdownMenu>
  );
}

function DeleteThread({ thread, members, trigger, onClose }: { thread: Thread; members: Bot[]; trigger: RefObject<HTMLButtonElement | null>; onClose(): void }) {
  const bots = useStore((s) => s.bots);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listId = useId();

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api.del(`/api/threads/${thread.id}`);
      onClose();
      goBack();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Delete “${threadTitle(thread, bots)}”?`}
      onClose={() => !busy && onClose()}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        trigger.current?.focus();
      }}
    >
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground">This deletes the thread and all its messages.</p>
        <div className="flex flex-col gap-2">
          <p id={listId} className="text-sm font-medium">
            Bots in this thread
          </p>
          <ul aria-labelledby={listId} className="flex flex-col gap-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <BotAvatar shape={m.shape} color={m.color} size={24} /> {m.name}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-muted-foreground">
          {thread.kind === "direct" ? "The bot stays, and so does its work on disk." : "Each bot's 1:1 chat with you stays, and so does their work on disk."}
        </p>
        {error && (
          <p role="alert" className="text-sm text-failing">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" className="rounded-full px-6" disabled={busy} onClick={remove}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RenameThread({ thread, trigger, onClose }: { thread: Thread; trigger: RefObject<HTMLButtonElement | null>; onClose(): void }) {
  const bots = useStore((s) => s.bots);
  const [title, setTitle] = useState(() => threadTitle(thread, bots));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title="Rename thread"
      onClose={() => !busy && onClose()}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        trigger.current?.focus();
      }}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api.patch(`/api/threads/${thread.id}`, { title });
            onClose();
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <Input aria-label="Thread name" value={title} readOnly={busy} onFocus={(e) => e.target.select()} onChange={(e) => setTitle(e.target.value)} />
        {error && (
          <p role="alert" className="text-sm text-failing">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="rounded-full px-6" disabled={busy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Composer({ thread, members, working }: { thread: Thread; members: Bot[]; working: boolean }) {
  const bots = useStore((s) => s.bots);
  const online = useStore(isConnected);
  const draftKey = `draft:${thread.id}`;
  const [text, setText] = useState(() => sessionStorage.getItem(draftKey) ?? "");
  const files = useStore((s) => s.attachments[thread.id]) ?? [];
  const uploading = useStore((s) => !!s.uploads[thread.id]);
  const [listening, setListening] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const input = useRef<MentionInputHandle>(null);

  function draft(next: string) {
    setText(next);
    sessionStorage.setItem(draftKey, next);
  }

  function redraft(next: string) {
    draft(next);
    input.current?.setText(next);
  }

  function attach(list: FileList | File[]) {
    if (list.length && online) void attachFiles(thread.id, [...list]);
  }

  function remove(fileId: string) {
    updateAttachments(thread.id, (f) => f.filter((x) => x.fileId !== fileId));
  }

  async function send(current = input.current?.getText() ?? text) {
    const body = current.trim();
    if ((!body && !files.length) || uploading) return;
    if (!online) {
      toast.warning("Not connected: message not sent", {
        id: "send-offline",
        description: "Reconnecting to the environment. Try again once it is connected.",
      });
      return;
    }
    const joining = thread.kind === "backchannel" ? [] : mentionedBots(body, bots).filter((b) => !thread.memberIds.includes(b.id));
    const regroup = thread.kind === "direct" && joining.length > 0;
    if (!regroup) for (const b of joining) await api.post(`/api/threads/${thread.id}/members`, { botId: b.id });
    const sending = files;
    const message = { text: body, fileIds: sending.map((f) => f.fileId) };
    redraft("");
    updateAttachments(thread.id, () => []);
    const restore = () => {
      redraft([body, sessionStorage.getItem(draftKey)].filter(Boolean).join("\n"));
      updateAttachments(thread.id, (f) => [...sending, ...f]);
    };
    if (regroup) {
      const group = await api.post<Thread>("/api/threads", { ...message, botIds: [...thread.memberIds, ...joining.map((b) => b.id)] }).catch(restore);
      if (group) enterThread(group);
    } else {
      await api.post(`/api/threads/${thread.id}/messages`, message).catch(restore);
    }
  }

  const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  function dictate() {
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const current = sessionStorage.getItem(draftKey) ?? "";
      redraft((current ? current + " " : "") + e.results[0][0].transcript);
    };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  const name = members.length === 1 ? members[0]!.name : thread.kind === "backchannel" ? "both bots" : "the group · @ to pick";
  const ready = !!text.trim() || files.length > 0;
  return (
    <footer
      className="flex-none px-3 pb-[max(12px,env(safe-area-inset-bottom))] md:px-5 md:pb-5"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => (e.preventDefault(), attach(e.dataTransfer.files))}
    >
      <OfflineBanner />
      <div className="mx-auto max-w-3xl rounded-3xl border bg-muted/50 p-1.5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.12)] transition-[color,box-shadow] has-[.ProseMirror-focused]:border-ring has-[.ProseMirror-focused]:ring-[3px] has-[.ProseMirror-focused]:ring-ring/50">
        {(files.length > 0 || uploading) && (
          <div className="flex flex-wrap items-center gap-2 px-2 pt-2 pb-2">
            {files.map((f) =>
              isImage(f.name) ? (
                <div key={f.fileId} className="relative size-24 flex-none">
                  <Button
                    variant="ghost"
                    className="size-full overflow-hidden rounded-2xl border bg-muted p-0"
                    aria-label={`Preview ${f.name}`}
                    onClick={() => openModal({ kind: "file", url: `/files/${f.fileId}`, name: f.name })}
                  >
                    <img src={`/files/${f.fileId}`} alt={f.name} className="size-full object-cover" />
                  </Button>
                  <Button variant="secondary" size="icon-xs" className="absolute top-1 right-1 rounded-full bg-background/95 shadow-sm" onClick={() => remove(f.fileId)} aria-label={`Remove ${f.name}`}>
                    <X />
                  </Button>
                </div>
              ) : (
                <Badge key={f.fileId} variant="secondary" className="max-w-full gap-1 py-1 pr-1">
                  <Paperclip className="shrink-0" /> <span className="truncate">{f.name}</span>
                  <button className="shrink-0 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10" onClick={() => remove(f.fileId)} aria-label={`Remove ${f.name}`}>
                    <X className="size-3" />
                  </button>
                </Badge>
              ),
            )}
            {uploading && (
              <Badge variant="secondary" className="py-1">
                <LoaderCircle className="animate-spin" /> Uploading…
              </Badge>
            )}
          </div>
        )}
        <div className="flex items-end gap-1">
          <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground" onClick={() => fileInput.current?.click()} aria-label="Attach" disabled={uploading || !online}>
            <Paperclip className="size-5" />
          </Button>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && attach(e.target.files)} />
          <MentionInput
            ref={input}
            value={text}
            onChange={draft}
            autoFocus={window.matchMedia("(pointer: fine)").matches}
            onSubmit={send}
            bots={bots}
            ariaLabel="Message"
            placeholder={`Message ${name}`}
            onPasteFiles={attach}
          />
          {SpeechRecognition && (
            <Button variant="ghost" size="icon" className={cn("rounded-full", listening && "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400")} onClick={dictate} aria-label="Dictate">
              <Mic className="size-5" />
            </Button>
          )}
          {working && !ready ? (
            <Button size="icon" className="rounded-full bg-bubble-user text-bubble-user-foreground hover:bg-bubble-user/90" onClick={() => api.post(`/api/threads/${thread.id}/stop`)} aria-label="Stop" disabled={!online}>
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button size="icon" className="rounded-full bg-bubble-user text-bubble-user-foreground hover:bg-bubble-user/90" onClick={() => send()} disabled={!ready || uploading || !online} aria-label={online ? "Send" : "Environment disconnected"}>
              <ArrowUp className="size-5" strokeWidth={2.4} />
            </Button>
          )}
        </div>
      </div>
    </footer>
  );
}
