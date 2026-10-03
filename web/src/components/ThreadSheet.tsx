import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Bot, Thread } from "../../../shared/types";
import { api } from "../api";
import { closeThread, openModal, openThread, threadTitle, useStore } from "../store";
import { AvatarStack, BotAvatar } from "./BotAvatar";
import { Icon } from "./Icon";
import { MentionInput, mentionedBots, type MentionInputHandle } from "./MentionInput";
import { MessageList } from "./Messages";

export function ThreadSheet({ thread }: { thread: Thread }) {
  const bots = useStore((s) => s.bots);
  const messages = useStore((s) => s.messages[thread.id]);
  const members = thread.memberIds.map((id) => bots.find((b) => b.id === id)).filter(Boolean) as Bot[];
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [menu, setMenu] = useState(false);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  useEffect(() => {
    pinned.current = true;
  }, [thread.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !useStore.getState().modal && closeThread();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Stop only makes sense while a turn is actually running (not while a bot waits on your answer).
  const working = !!messages?.some((m) => m.status === "streaming");
  const multi = members.length > 1 || thread.kind === "backchannel";
  const title = threadTitle(thread, bots);

  return (
    <section className="sheet" key={thread.id} role="region" aria-label={`Thread with ${title}`} data-thread-id={thread.id}>
      <header className="sheet-head">
        <button className="round" onClick={closeThread} aria-label="Back">
          <Icon name="back" />
        </button>
        <div className="sheet-title">
          <AvatarStack bots={members} size={30} />
          <span className="sheet-title-text">{title}</span>
          {thread.topic && <span className="topic">{thread.topic}</span>}
        </div>
        <div className="sheet-actions">
          {members[0] && (
            <button className="round" title="Open the bot's desk (workspace)" aria-label="Open desk" onClick={() => openModal({ kind: "workspace", botId: members[0]!.id })}>
              <Icon name="monitor" />
            </button>
          )}
          <button className="round" onClick={() => setMenu(!menu)} aria-label="More">
            <Icon name="more" />
          </button>
          {menu && <ThreadMenu thread={thread} members={members} onClose={() => setMenu(false)} />}
        </div>
      </header>

      <div
        className="sheet-scroll"
        role="log"
        aria-label="Conversation"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {thread.kind === "backchannel" && (
          <div className="msg-system">Private channel between {members.map((m) => m.name).join(" and ")}. You can read along or step in.</div>
        )}
        {!messages && <div className="sheet-loading"><span className="typing"><i /><i /><i /></span></div>}
        {messages && messages.length === 0 && members[0] && <Hello bot={members[0]} />}
        {messages && <MessageList messages={messages} bots={bots} multi={multi} />}
      </div>

      <Composer thread={thread} members={members} working={working} />
    </section>
  );
}

function Hello({ bot }: { bot: Bot }) {
  return (
    <div className="hello">
      <BotAvatar shape={bot.shape} color={bot.color} size={120} />
      <h3>{bot.name}</h3>
      <p>{bot.role || "Ready when you are."}</p>
    </div>
  );
}

function ThreadMenu({ thread, members, onClose }: { thread: Thread; members: Bot[]; onClose(): void }) {
  const bots = useStore((s) => s.bots);
  const others = bots.filter((b) => !thread.memberIds.includes(b.id));
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const close = () => onClose();
    setTimeout(() => window.addEventListener("click", close), 0);
    return () => window.removeEventListener("click", close);
  }, [onClose]);
  return (
    <div className="menu pop-in" role="menu" aria-label="Thread menu" onClick={(e) => e.stopPropagation()}>
      {!adding ? (
        <>
          <button
            onClick={async () => {
              const title = prompt("Thread name", threadTitle(thread, bots));
              if (title !== null) await api.patch(`/api/threads/${thread.id}`, { title });
              onClose();
            }}
          >
            <Icon name="edit" size={16} /> Rename
          </button>
          {others.length > 0 && thread.kind !== "backchannel" && (
            <button onClick={() => setAdding(true)}>
              <Icon name="users" size={16} /> Bring in a bot
            </button>
          )}
          {members.map((m) => (
            <button key={m.id} onClick={() => (openModal({ kind: "bot", botId: m.id }), onClose())}>
              <BotAvatar shape={m.shape} color={m.color} size={16} /> Edit {m.name}
            </button>
          ))}
          <button
            className="danger"
            onClick={async () => {
              if (!confirm("Delete this thread? The bots' work on disk stays.")) return;
              await api.del(`/api/threads/${thread.id}`);
              closeThread();
            }}
          >
            <Icon name="trash" size={16} /> Delete thread
          </button>
        </>
      ) : (
        others.map((b) => (
          <button
            key={b.id}
            onClick={async () => {
              await api.post(`/api/threads/${thread.id}/members`, { botId: b.id });
              onClose();
            }}
          >
            <BotAvatar shape={b.shape} color={b.color} size={18} /> {b.name}
          </button>
        ))
      )}
    </div>
  );
}

type Attachment = { fileId: string; name: string; size: number };

function Composer({ thread, members, working }: { thread: Thread; members: Bot[]; working: boolean }) {
  const bots = useStore((s) => s.bots);
  const [text, setText] = useState(() => sessionStorage.getItem(`draft:${thread.id}`) ?? "");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const input = useRef<MentionInputHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sessionStorage.setItem(`draft:${thread.id}`, text);
  }, [text, thread.id]);
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) input.current?.focus();
  }, [thread.id]);

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
    // @mentioning a bot that isn't here pulls it into the thread.
    if (thread.kind !== "backchannel") {
      for (const b of mentionedBots(body, bots)) {
        if (!thread.memberIds.includes(b.id)) await api.post(`/api/threads/${thread.id}/members`, { botId: b.id });
      }
    }
    setText("");
    setFiles([]);
    await api.post(`/api/threads/${thread.id}/messages`, { text: body, fileIds: files.map((f) => f.fileId) });
  }

  const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  function dictate() {
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.interimResults = false;
    rec.onresult = (e: any) => setText((t) => (t ? t + " " : "") + e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  const name = members.length === 1 ? members[0]!.name : thread.kind === "backchannel" ? "both bots" : "the group · @ to pick";
  return (
    <footer className="composer" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), attach(e.dataTransfer.files))}>
      {files.length > 0 && (
        <div className="composer-files">
          {files.map((f) => (
            <span key={f.fileId} className="chip">
              <Icon name="clip" size={12} /> {f.name}
              <button onClick={() => setFiles(files.filter((x) => x.fileId !== f.fileId))} aria-label="Remove">
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-row">
        <button className="round" onClick={() => fileInput.current?.click()} aria-label="Attach" disabled={uploading}>
          <Icon name={uploading ? "clock" : "plus"} />
        </button>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && attach(e.target.files)} />
        <div className="composer-pill">
          <MentionInput
            ref={input}
            value={text}
            onChange={setText}
            onSubmit={send}
            bots={bots}
            ariaLabel="Message"
            placeholder={`Ask ${name}`}
            onPaste={(e) => e.clipboardData.files.length && (e.preventDefault(), attach(e.clipboardData.files))}
          />
          {text.trim() || files.length ? (
            <button className="send" onClick={send} aria-label="Send">
              <Icon name="send" size={18} stroke={2.4} />
            </button>
          ) : working ? (
            <button className="send stop" onClick={() => api.post(`/api/threads/${thread.id}/stop`)} aria-label="Stop">
              <Icon name="stop" size={14} stroke={3} />
            </button>
          ) : SpeechRecognition ? (
            <button className={`mic ${listening ? "on" : ""}`} onClick={dictate} aria-label="Dictate">
              <Icon name="mic" size={18} />
            </button>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
