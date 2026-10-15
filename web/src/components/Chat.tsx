import { type RefObject, useRef, useState } from "react";
import { ArrowUp, ChevronLeft, Ellipsis, Mic, Monitor, Paperclip, Pencil, Plus, Square, Trash2, UserPlus, X } from "lucide-react";
import type { Bot, Thread } from "../../../shared/types";
import { api } from "../api";
import { goBack, openModal, threadTitle, togglePanel, useStore } from "../store";
import { AvatarStack, BotAvatar, LiveAvatar } from "./BotAvatar";
import { MentionInput, mentionedBots } from "./MentionInput";
import { MessageList } from "./Messages";
import { Modal } from "./Modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export function Chat({ thread }: { thread: Thread }) {
  const bots = useStore((s) => s.bots);
  const messages = useStore((s) => s.messages[thread.id]);
  const panelOpen = useStore((s) => s.panelOpen);
  const members = thread.memberIds.map((id) => bots.find((b) => b.id === id)).filter((b): b is Bot => !!b);

  const working = !!messages?.some((m) => m.status === "streaming");
  const multi = members.length > 1 || thread.kind === "backchannel";
  const title = threadTitle(thread, bots);

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background" role="region" aria-label={`Thread with ${title}`} data-thread-id={thread.id}>
      <header className="flex h-14 flex-none items-center gap-2 px-3 md:px-5">
        <Button variant="ghost" size="icon" className={cn("rounded-full", thread.kind !== "backchannel" && "md:hidden")} onClick={goBack} aria-label="Back">
          <ChevronLeft className="size-5" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {members.length === 1 ? <LiveAvatar bot={members[0]!} size={28} /> : <AvatarStack bots={members} size={28} />}
          <span className="truncate text-[17px] font-semibold">{title}</span>
          {thread.topic && <Badge variant="secondary">{thread.topic}</Badge>}
        </div>
        {members.length > 0 && thread.kind !== "backchannel" && (
          <Button
            variant="ghost"
            size="icon"
            className={cn("rounded-full", panelOpen && "bg-accent")}
            title="Open the bot's desk and routines"
            aria-label="Open desk"
            aria-pressed={panelOpen}
            onClick={togglePanel}
          >
            <Monitor className="size-5" />
          </Button>
        )}
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
          {messages && messages.length === 0 && members[0] && <Hello bot={members[0]} />}
          {messages && <MessageList messages={messages} bots={bots} multi={multi} />}
        </div>
      </div>

      <Composer thread={thread} members={members} working={working} />
    </section>
  );
}

function Hello({ bot }: { bot: Bot }) {
  return (
    <div className="m-auto flex flex-col items-center gap-2 py-10 text-center">
      <BotAvatar shape={bot.shape} color={bot.color} size={112} />
      <h3 className="mt-2 text-xl font-semibold">{bot.name}</h3>
      <p className="max-w-sm text-muted-foreground">{bot.role || "Ready when you are."}</p>
    </div>
  );
}

function ThreadMenu({ thread, members }: { thread: Thread; members: Bot[] }) {
  const bots = useStore((s) => s.bots);
  const others = bots.filter((b) => !thread.memberIds.includes(b.id));
  const [renaming, setRenaming] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
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
                <DropdownMenuItem key={b.id} onSelect={() => api.post(`/api/threads/${thread.id}/members`, { botId: b.id })}>
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
        <DropdownMenuItem
          variant="destructive"
          onSelect={async () => {
            if (!confirm("Delete this thread? The bots' work on disk stays.")) return;
            await api.del(`/api/threads/${thread.id}`);
            goBack();
          }}
        >
          <Trash2 /> Delete thread
        </DropdownMenuItem>
      </DropdownMenuContent>
      {renaming && <RenameThread thread={thread} trigger={more} onClose={() => setRenaming(false)} />}
    </DropdownMenu>
  );
}

function RenameThread({ thread, trigger, onClose }: { thread: Thread; trigger: RefObject<HTMLButtonElement | null>; onClose(): void }) {
  const bots = useStore((s) => s.bots);
  const [title, setTitle] = useState(() => threadTitle(thread, bots));
  return (
    <Modal
      title="Rename thread"
      onClose={onClose}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        trigger.current?.focus();
      }}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await api.patch(`/api/threads/${thread.id}`, { title });
          onClose();
        }}
      >
        <Input aria-label="Thread name" value={title} onFocus={(e) => e.target.select()} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="rounded-full px-6">
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type Attachment = { fileId: string; name: string; size: number };

function Composer({ thread, members, working }: { thread: Thread; members: Bot[]; working: boolean }) {
  const bots = useStore((s) => s.bots);
  const draftKey = `draft:${thread.id}`;
  const [text, setText] = useState(() => sessionStorage.getItem(draftKey) ?? "");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function draft(next: string) {
    setText(next);
    sessionStorage.setItem(draftKey, next);
  }

  async function attach(list: FileList | File[]) {
    if (!list.length) return;
    setUploading(true);
    try {
      const up = await api.upload([...list]);
      setFiles((f) => [...f, ...up]);
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    const body = text.trim();
    if (!body && !files.length) return;
    if (thread.kind !== "backchannel") {
      for (const b of mentionedBots(body, bots)) {
        if (!thread.memberIds.includes(b.id)) await api.post(`/api/threads/${thread.id}/members`, { botId: b.id });
      }
    }
    draft("");
    setFiles([]);
    await api.post(`/api/threads/${thread.id}/messages`, { text: body, fileIds: files.map((f) => f.fileId) });
  }

  const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  function dictate() {
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const current = sessionStorage.getItem(draftKey) ?? "";
      draft((current ? current + " " : "") + e.results[0][0].transcript);
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
      <div className="mx-auto max-w-3xl rounded-[26px] border bg-background p-1.5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.12)]">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-2 pt-1.5 pb-1">
            {files.map((f) => (
              <Badge key={f.fileId} variant="secondary" className="gap-1 py-1 pr-1">
                <Paperclip /> {f.name}
                <button className="rounded-full p-0.5 hover:bg-black/10" onClick={() => setFiles(files.filter((x) => x.fileId !== f.fileId))} aria-label="Remove">
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1">
          <Button variant="secondary" size="icon" className="rounded-full" onClick={() => fileInput.current?.click()} aria-label="Attach" disabled={uploading}>
            <Plus className="size-5" />
          </Button>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && attach(e.target.files)} />
          <MentionInput
            value={text}
            onChange={draft}
            autoFocus={window.matchMedia("(pointer: fine)").matches}
            onSubmit={send}
            bots={bots}
            ariaLabel="Message"
            placeholder={`Message ${name}`}
            onPaste={(e) => e.clipboardData.files.length && (e.preventDefault(), attach(e.clipboardData.files))}
          />
          {SpeechRecognition && (
            <Button variant="ghost" size="icon" className={cn("rounded-full", listening && "bg-red-50 text-red-600")} onClick={dictate} aria-label="Dictate">
              <Mic className="size-5" />
            </Button>
          )}
          {working && !ready ? (
            <Button size="icon" className="rounded-full" onClick={() => api.post(`/api/threads/${thread.id}/stop`)} aria-label="Stop">
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button size="icon" className="rounded-full" onClick={send} disabled={!ready} aria-label="Send">
              <ArrowUp className="size-5" strokeWidth={2.4} />
            </Button>
          )}
        </div>
      </div>
    </footer>
  );
}
