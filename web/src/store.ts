import { create } from "zustand";
import type { Bot, BotStatus, HostInfo, Link, Message, ServerEvent, Thread } from "../../shared/types";
import { api, Unpaired } from "./api";

export type Modal =
  | { kind: "bot"; botId: string }
  | { kind: "connectors" }
  | { kind: "providers" }
  | { kind: "settings" }
  | { kind: "file"; url: string; name: string }
  | null;

/** What the main pane shows. Each one is a history entry, so the phone's back button walks back through them. */
type View = { thread?: string; creating?: boolean };

export type Connection = "connecting" | "connected" | "reconnecting" | "offline";
export type Failure = "offline" | "no-answer" | "timeout";

interface State {
  connection: Connection;
  failure: Failure | null;
  graceElapsed: boolean;
  hostname: string | null;
  unpaired: boolean;
  loaded: boolean;
  bots: Bot[];
  statuses: Record<string, BotStatus>;
  threads: Thread[];
  links: Link[];
  messages: Record<string, Message[]>;
  openThreadId: string | null;
  creating: boolean;
  panelOpen: boolean;
  modal: Modal;
  /** The control focus returns to once the modal closes. */
  modalOpener: HTMLElement | null;
  search: string;
  devicesVersion: number;
}

export const useStore = create<State>(() => ({
  connection: "connecting",
  failure: null,
  graceElapsed: false,
  hostname: null,
  unpaired: false,
  loaded: false,
  bots: [],
  statuses: {},
  threads: [],
  links: [],
  messages: {},
  openThreadId: null,
  creating: false,
  panelOpen: false,
  modal: null,
  modalOpener: null,
  search: "",
  devicesVersion: 0,
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
    case "hello": {
      const firstLoad = !get().loaded;
      set({
        bots: e.bots,
        statuses: Object.fromEntries(e.statuses.map((s) => [s.botId, s])),
        threads: e.threads,
        links: e.links,
        loaded: true,
        devicesVersion: get().devicesVersion + 1,
      });
      if (get().openThreadId) void loadMessages(get().openThreadId!);
      else if (firstLoad) land(e.threads);
      break;
    }
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
    case "devices":
      set({ devicesVersion: get().devicesVersion + 1 });
      break;
  }
}

const GRACE_MS = 2_000;
const STABLE_MS = 30_000;
const PROBE_TIMEOUT_MS = 15_000;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 300_000;
const HEARTBEAT_SLACK_MS = 5_000;

let socket: WebSocket | null = null;
let latest = 0;
let failures = 0;
let openedAt = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let graceTimer: ReturnType<typeof setTimeout> | undefined;
let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;

export function retryDelay(previousFailures: number, random: number) {
  const ceiling = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (previousFailures + 1));
  return Math.round(ceiling / 2 + (ceiling / 2) * random);
}

function setConnection(connection: Connection, failure: Failure | null) {
  if (connection !== get().connection) {
    clearTimeout(graceTimer);
    if (connection === "reconnecting") graceTimer = setTimeout(() => set({ graceElapsed: true }), GRACE_MS);
    set({ graceElapsed: false });
  }
  set({ connection, failure });
}

const probe = () => api.get<HostInfo>("/api/host", AbortSignal.timeout(PROBE_TIMEOUT_MS));

function lose(failure: Failure | null) {
  if (!navigator.onLine) return setConnection("offline", "offline");
  setConnection("reconnecting", failure);
  retryTimer = setTimeout(open, retryDelay(failures++, Math.random()));
}

function dropped() {
  clearTimeout(heartbeatTimer);
  const wasOpen = openedAt > 0;
  if (wasOpen && Date.now() - openedAt >= STABLE_MS) failures = 0;
  socket = null;
  openedAt = 0;
  lose(wasOpen ? null : "no-answer");
}

async function open() {
  const id = ++latest;
  clearTimeout(retryTimer);
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  const host = await probe().catch((e: Error) => e);
  if (id !== latest) return;
  if (host instanceof Unpaired) return set({ unpaired: true });
  if (host instanceof Error) return lose(host.name === "TimeoutError" ? "timeout" : "no-answer");
  set({ hostname: host.hostname });
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  socket = ws;
  ws.onopen = () => {
    openedAt = Date.now();
    set({ unpaired: false });
    setConnection("connected", null);
  };
  ws.onmessage = (m) => {
    const e: ServerEvent = JSON.parse(m.data);
    if (e.type === "heartbeat") expectHeartbeat(ws, e.everyMs);
    else apply(e);
  };
  ws.onclose = () => socket === ws && dropped();
}

function check(ws: WebSocket) {
  const id = ++latest;
  probe().catch(() => {
    if (id !== latest || socket !== ws) return;
    ws.close();
    dropped();
  });
}

function expectHeartbeat(ws: WebSocket, everyMs: number) {
  clearTimeout(heartbeatTimer);
  heartbeatTimer = setTimeout(() => {
    if (socket !== ws) return;
    ws.close();
    dropped();
  }, 2 * everyMs + HEARTBEAT_SLACK_MS);
}

export function reconnect() {
  if (socket && get().connection === "connected") return check(socket);
  failures = 0;
  void open();
}

export function connect() {
  window.addEventListener("online", reconnect);
  window.addEventListener("offline", reconnect);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && reconnect());
  void open();
}

export const isConnected = (s: State) => s.connection === "connected";
export const showOffline = (s: State) => s.connection === "offline" || (s.connection === "reconnecting" && s.graceElapsed);
export const offlineTitle = (s: State) => `${s.hostname ?? "Fabs Bot"} is ${s.connection === "offline" ? "offline" : "reconnecting"}`;

export function offlineReason(s: State) {
  if (s.failure === "offline") return "This device is offline";
  if (s.failure === "timeout") return `${s.hostname ?? "Fabs Bot"} did not answer in time`;
  if (s.failure === "no-answer") return s.hostname ? `Fabs Bot on ${s.hostname} did not answer` : "Fabs Bot did not answer";
  return null;
}

export async function loadMessages(threadId: string) {
  const msgs = await api.get<Message[]>(`/api/threads/${threadId}/messages`);
  set({ messages: { ...get().messages, [threadId]: msgs } });
}

function show(view: View) {
  set({ openThreadId: view.thread ?? null, creating: !!view.creating });
  if (view.thread) {
    void loadMessages(view.thread);
    void api.post(`/api/threads/${view.thread}/read`).catch(() => {});
  }
}

function go(view: View, stack: boolean) {
  if (history.state?.view && !stack) history.replaceState({ view }, "");
  else history.pushState({ view }, "");
  show(view);
}

/** On desktop, start in the latest chat instead of an empty pane. */
function land(threads: Thread[]) {
  if (get().creating || !window.matchMedia("(min-width: 768px)").matches) return;
  const latest = threads.find((t) => t.kind !== "backchannel");
  if (!latest) return;
  history.replaceState({ view: { thread: latest.id } }, "");
  show({ thread: latest.id });
}

export const openThread = (threadId: string) => go({ thread: threadId }, false);
/** Stacks on top of the current chat, so Back returns to it. */
export const openNestedThread = (threadId: string) => go({ thread: threadId }, true);
export const startCreating = () => go({ creating: true }, false);
export const restoreView = () => show(history.state?.view ?? {});

export function goBack() {
  if (history.state?.view) history.back();
  else show({});
}

export async function openDirect(botId: string) {
  const t = await api.post<Thread>(`/api/bots/${botId}/direct`);
  set({ threads: upsert(get().threads, t).sort((a, b) => b.updatedAt - a.updatedAt) });
  openThread(t.id);
}

/** The focused element, or the trigger of the menu it sits in. */
function focusedOpener() {
  const active = document.activeElement;
  const menu = active?.closest("[role=menu]");
  const trigger = menu && document.getElementById(menu.getAttribute("aria-labelledby") ?? "");
  return (trigger ?? active) as HTMLElement | null;
}

export const openModal = (modal: Modal) => set({ modal, modalOpener: focusedOpener() });
export const closeModal = () => set({ modal: null });
export const togglePanel = () => set({ panelOpen: !get().panelOpen });
export const closePanel = () => set({ panelOpen: false });

export function botById(id: string | null | undefined): Bot | undefined {
  return id ? get().bots.find((b) => b.id === id) : undefined;
}

export function threadTitle(t: Thread, bots: Bot[]) {
  if (t.title) return t.title;
  const names = t.memberIds.map((id) => bots.find((b) => b.id === id)?.name ?? "Former bot");
  return names.join(", ");
}
