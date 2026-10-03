import { create } from "zustand";
import type { Bot, BotStatus, Link, Message, ServerEvent, Thread } from "../../shared/types";
import { api, Unpaired } from "./api";

export type Modal =
  | { kind: "bot"; botId?: string; onboarding?: boolean }
  | { kind: "connectors" }
  | { kind: "settings" }
  | { kind: "workspace"; botId: string }
  | { kind: "file"; url: string; name: string }
  | null;

interface State {
  connected: boolean;
  unpaired: boolean;
  serverDown: boolean;
  loaded: boolean;
  bots: Bot[];
  statuses: Record<string, BotStatus>;
  threads: Thread[];
  links: Link[];
  messages: Record<string, Message[]>;
  openThreadId: string | null;
  selectedBotId: string | null;
  modal: Modal;
  inboxFilter: "all" | "needs" | "bots";
  search: string;
}

export const useStore = create<State>(() => ({
  connected: false,
  unpaired: false,
  serverDown: false,
  loaded: false,
  bots: [],
  statuses: {},
  threads: [],
  links: [],
  messages: {},
  openThreadId: null,
  selectedBotId: null,
  modal: null,
  inboxFilter: "all",
  search: "",
}));

const set = useStore.setState;
const get = useStore.getState;

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

function apply(e: ServerEvent) {
  switch (e.type) {
    case "hello":
      set({
        bots: e.bots,
        statuses: Object.fromEntries(e.statuses.map((s) => [s.botId, s])),
        threads: e.threads,
        links: e.links,
        loaded: true,
      });
      // Re-sync an open thread after reconnecting.
      if (get().openThreadId) void loadMessages(get().openThreadId!);
      break;
    case "bot":
      set({ bots: upsert(get().bots, e.bot) });
      break;
    case "bot.deleted":
      set({ bots: get().bots.filter((b) => b.id !== e.botId) });
      break;
    case "status":
      set({ statuses: { ...get().statuses, [e.status.botId]: e.status } });
      break;
    case "thread":
      set({ threads: upsert(get().threads, e.thread).sort((a, b) => b.updatedAt - a.updatedAt) });
      break;
    case "thread.deleted":
      set({
        threads: get().threads.filter((t) => t.id !== e.threadId),
        openThreadId: get().openThreadId === e.threadId ? null : get().openThreadId,
      });
      break;
    case "message": {
      const list = get().messages[e.message.threadId];
      if (!list) break;
      set({
        messages: {
          ...get().messages,
          [e.message.threadId]: upsert(list, e.message).sort((a, b) => a.seq - b.seq),
        },
      });
      if (e.message.threadId === get().openThreadId && e.message.status !== "streaming" && document.hasFocus()) {
        void api.post(`/api/threads/${e.message.threadId}/read`).catch(() => {});
      }
      break;
    }
    case "link.start":
      set({ links: [...get().links, e.link] });
      break;
    case "link.end":
      set({ links: get().links.filter((l) => l.id !== e.linkId) });
      break;
  }
}

let retry = 0;
export async function connect() {
  try {
    await api.get("/api/host");
  } catch (e) {
    if (e instanceof Unpaired) {
      set({ unpaired: true });
      return;
    }
    // The server isn't answering (stopped, crashed, or only Vite is running).
    set({ serverDown: true });
    setTimeout(connect, Math.min(10_000, 500 * 2 ** retry++));
    return;
  }
  set({ serverDown: false });
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => {
    retry = 0;
    set({ connected: true, unpaired: false });
  };
  ws.onmessage = (m) => apply(JSON.parse(m.data));
  ws.onclose = () => {
    set({ connected: false });
    setTimeout(connect, Math.min(10_000, 500 * 2 ** retry++));
  };
}

export async function loadMessages(threadId: string) {
  const msgs = await api.get<Message[]>(`/api/threads/${threadId}/messages`);
  set({ messages: { ...get().messages, [threadId]: msgs } });
}

export function openThread(threadId: string | null) {
  set({ openThreadId: threadId, selectedBotId: null });
  if (threadId) {
    void loadMessages(threadId);
    void api.post(`/api/threads/${threadId}/read`).catch(() => {});
  }
}

/** Close the open thread, consuming its history entry so the phone's back button stays meaningful. */
export function closeThread() {
  if (history.state?.thread) history.back(); // popstate → openThread(null)
  else openThread(null);
}

export async function openDirect(botId: string) {
  const t = await api.post<Thread>(`/api/bots/${botId}/direct`);
  set({ threads: upsert(get().threads, t).sort((a, b) => b.updatedAt - a.updatedAt) });
  openThread(t.id);
}

export const openModal = (modal: Modal) => set({ modal, selectedBotId: null });
export const closeModal = () => set({ modal: null });
export const selectBot = (id: string | null) => set({ selectedBotId: id });

export function botById(id: string | null | undefined): Bot | undefined {
  return id ? get().bots.find((b) => b.id === id) : undefined;
}

/** A thread "needs you" when a bot is waiting on you in it, or it has an unanswered question / approval. */
export function threadNeedsYou(t: Thread, statuses: Record<string, BotStatus>) {
  return t.memberIds.some((id) => statuses[id]?.state === "waiting" && statuses[id]?.threadId === t.id);
}

export function threadTitle(t: Thread, bots: Bot[]) {
  if (t.title) return t.title;
  const names = t.memberIds.map((id) => bots.find((b) => b.id === id)?.name ?? "Former bot");
  return names.join(", ");
}
