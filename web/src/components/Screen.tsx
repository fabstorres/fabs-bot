import {
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { ChevronLeft, Keyboard, LoaderCircle, Maximize2, MonitorOff, X } from "lucide-react";
import type { Bot, Message, ScreenState, Thread } from "../../../shared/types";
import { api } from "../api";
import { useNow } from "../hooks";
import { closeScreen, isConnected, useStore, usingScreen } from "../store";
import { BotAvatar, LiveAvatar } from "./BotAvatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACK = JSON.stringify({ type: "ack" });
const TAKE = JSON.stringify({ type: "take" });
const RECONNECT_MS = 2_000;
const MOVE_EVERY_MS = 30;
const TAP_SLOP_PX = 8;
const BUTTONS = ["left", "middle", "right"] as const;
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);

export const displayUrl = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

function closedState(botId: string): ScreenState {
  return { botId, status: "closed", url: "", title: "", controller: "bot", activeAt: 0, updatedAt: 0 };
}

const useScreenState = (botId: string) => useStore((s) => s.screens[botId]) ?? closedState(botId);

type Stream = {
  canvas: RefObject<HTMLCanvasElement | null>;
  hasFrame: boolean;
  lastFrameAt: RefObject<number>;
  pointer: { x: number; y: number; at: number } | null;
  asked: boolean;
  send(message: object): void;
  take(): void;
  release(): void;
};

export function useScreenStream(botId: string, takeOnOpen = false): Stream {
  const canvas = useRef<HTMLCanvasElement>(null);
  const socket = useRef<WebSocket | null>(null);
  const wantsControl = useRef(takeOnOpen);
  const lastFrameAt = useRef(0);
  const [hasFrame, setHasFrame] = useState(false);
  const [pointer, setPointer] = useState<Stream["pointer"]>(null);
  const [asked, setAsked] = useState(takeOnOpen);

  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/screen?bot=${encodeURIComponent(botId)}`);
      socket.current = ws;
      ws.onopen = () => wantsControl.current && ws.send(TAKE);
      ws.onmessage = async (m) => {
        if (typeof m.data === "string") {
          const e = JSON.parse(m.data);
          if (e.type === "pointer") setPointer({ x: e.x, y: e.y, at: Date.now() });
          return;
        }
        const bitmap = await createImageBitmap(m.data as Blob).catch(() => null);
        const c = canvas.current;
        if (bitmap && c) {
          if (c.width !== bitmap.width) c.width = bitmap.width;
          if (c.height !== bitmap.height) c.height = bitmap.height;
          c.getContext("2d")?.drawImage(bitmap, 0, 0);
          lastFrameAt.current = Date.now();
          setHasFrame(true);
        }
        bitmap?.close();
        if (ws.readyState === WebSocket.OPEN) ws.send(ACK);
      };
      ws.onclose = () => {
        if (!stopped) retry = setTimeout(connect, RECONNECT_MS);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket.current?.close();
      socket.current = null;
    };
  }, [botId]);

  const send = (message: object) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(message));
  };
  return {
    canvas,
    hasFrame,
    lastFrameAt,
    pointer,
    asked,
    send,
    take() {
      wantsControl.current = true;
      setAsked(true);
      send({ type: "take" });
    },
    release() {
      wantsControl.current = false;
      setAsked(false);
      send({ type: "release" });
    },
  };
}

function ScreenFrame({ bot, state, stream, dim = false }: { bot: Bot; state: ScreenState; stream: Stream; dim?: boolean }) {
  const chromium = useStore((s) => s.chromium);
  const open = state.status !== "closed";
  const live = open && stream.hasFrame;
  return (
    <>
      <canvas ref={stream.canvas} className={cn("absolute inset-0 size-full bg-white", !live && "invisible", dim && "opacity-60 grayscale")} />
      {!live && (
        <span className="absolute inset-0 grid place-items-center bg-muted p-3 text-center text-[13px] text-muted-foreground">
          {!open && !chromium ? (
            <span className="flex flex-col items-center gap-2">
              <MonitorOff className="size-6" />
              No Chromium browser found
            </span>
          ) : !open ? (
            <span className="flex flex-col items-center gap-2">
              <BotAvatar shape={bot.shape} color={bot.color} size={36} state="waiting" />
              Nothing open
            </span>
          ) : (
            <span className="flex max-w-full min-w-0 flex-col items-center gap-2">
              <LoaderCircle className="size-5 animate-spin" />
              <span className="max-w-full truncate">{displayUrl(state.url) || "Opening…"}</span>
            </span>
          )}
        </span>
      )}
    </>
  );
}

function ago(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

export function ScreenTile({ bot, onOpen }: { bot: Bot; onOpen(): void }) {
  const state = useScreenState(bot.id);
  const stream = useScreenStream(bot.id);
  const online = useStore(isConnected);
  const now = useNow(30_000);
  const live = state.status !== "closed" && stream.hasFrame;
  const stale = live && !online;
  return (
    <section className="mb-6" aria-label={`${bot.name}'s screen`}>
      <button
        type="button"
        disabled={!live || stale}
        onClick={onOpen}
        aria-label={`Open ${bot.name}'s screen`}
        className="group relative block aspect-[16/10] w-full overflow-hidden rounded-2xl border bg-muted disabled:cursor-default"
      >
        <ScreenFrame bot={bot} state={state} stream={stream} dim={stale} />
        {live && !stale && (
          <span className="absolute top-1/2 left-1/2 flex -translate-1/2 items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors group-hover:bg-black/85">
            <Maximize2 className="size-3.5" />
            Open
          </span>
        )}
        {stale && (
          <span className="absolute top-1/2 left-1/2 -translate-1/2 rounded-full bg-black/60 px-3 py-1.5 text-sm whitespace-nowrap text-white">
            Last seen {ago(now - stream.lastFrameAt.current)}
          </span>
        )}
      </button>
      <p className="mt-2 text-center text-[13px] text-muted-foreground">{bot.name}'s screen</p>
    </section>
  );
}

export function ScreenThumb({ bot }: { bot: Bot }) {
  const state = useScreenState(bot.id);
  const stream = useScreenStream(bot.id);
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border bg-muted">
      <ScreenFrame bot={bot} state={state} stream={stream} />
    </div>
  );
}

export function pendingHandOver(messages: Message[] | undefined, botId: string) {
  for (const m of [...(messages ?? [])].reverse()) {
    const index = m.parts.findIndex((p) => p.type === "screen" && p.botId === botId && !p.outcome);
    if (index >= 0) return { messageId: m.id, index };
  }
  return null;
}

export const settleHandOver = (messageId: string, index: number, outcome: "done" | "skipped") =>
  api.post(`/api/messages/${messageId}/screen`, { partIndex: index, outcome });

function StatusChip({ bot, state, controlling, now, className }: { bot: Bot; state: ScreenState; controlling: boolean; now: number; className?: string }) {
  const using = usingScreen(state, now);
  const text =
    state.controller === "user" ? (controlling ? "You" : "You, on another device") : using ? `${bot.name} is using it` : state.status === "closed" ? "Nothing open" : "Idle";
  return (
    <span className={cn("flex flex-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] whitespace-nowrap", className)} role="status">
      {state.status !== "closed" && (
        <span
          className={cn("size-2 rounded-full", state.controller === "user" ? "bg-foreground" : !using && "bg-muted-foreground/50", using && "animate-pulse")}
          style={using ? { background: bot.color } : undefined}
        />
      )}
      {text}
    </span>
  );
}

function useControls(stream: Stream, keys: RefObject<HTMLTextAreaElement | null>) {
  const lastMove = useRef(0);
  const touch = useRef<{ x: number; y: number; lastX: number; lastY: number; scrolling: boolean } | null>(null);
  const down = useRef(new Set<string>());

  const at = (e: { clientX: number; clientY: number }) => {
    const c = stream.canvas.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const button = (e: ReactPointerEvent) => BUTTONS[e.button] ?? "left";
  const keyName = (key: string) => (IS_MAC && key === "Meta" ? "Control" : key);
  const typed = (e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) =>
    (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) || e.key === "Unidentified" || e.key === "Process" || e.key === "Dead";

  return {
    pointer: {
      onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        if (e.pointerType === "touch") {
          touch.current = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, scrolling: false };
          return;
        }
        keys.current?.focus({ preventScroll: true });
        stream.send({ type: "mouse", action: "down", button: button(e), ...at(e) });
      },
      onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
        const t = touch.current;
        if (e.pointerType === "touch" && t) {
          if (!t.scrolling && Math.hypot(e.clientX - t.x, e.clientY - t.y) < TAP_SLOP_PX) return;
          t.scrolling = true;
          stream.send({ type: "wheel", ...at(e), dx: t.lastX - e.clientX, dy: t.lastY - e.clientY });
          t.lastX = e.clientX;
          t.lastY = e.clientY;
          return;
        }
        if (e.timeStamp - lastMove.current < MOVE_EVERY_MS) return;
        lastMove.current = e.timeStamp;
        stream.send({ type: "mouse", action: "move", ...at(e) });
      },
      onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
        const t = touch.current;
        if (e.pointerType === "touch") {
          touch.current = null;
          if (!t || t.scrolling) return;
          const tap = at({ clientX: t.x, clientY: t.y });
          stream.send({ type: "mouse", action: "down", button: "left", ...tap });
          stream.send({ type: "mouse", action: "up", button: "left", ...tap });
          return;
        }
        stream.send({ type: "mouse", action: "up", button: button(e), ...at(e) });
      },
      onWheel(e: WheelEvent<HTMLDivElement>) {
        const scale = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
        stream.send({ type: "wheel", ...at(e), dx: e.deltaX * scale, dy: e.deltaY * scale });
      },
      onContextMenu(e: MouseEvent) {
        e.preventDefault();
      },
    },
    keys: {
      onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (e.nativeEvent.isComposing || typed(e)) return;
        e.preventDefault();
        const key = keyName(e.key);
        down.current.add(key);
        stream.send({ type: "key", action: "down", key });
      },
      onKeyUp(e: KeyboardEvent<HTMLTextAreaElement>) {
        const key = keyName(e.key);
        if (!down.current.delete(key)) return;
        stream.send({ type: "key", action: "up", key });
      },
      onInput(e: FormEvent<HTMLTextAreaElement>) {
        const field = e.currentTarget;
        if (field.value) stream.send({ type: "text", text: field.value });
        field.value = "";
      },
      onBlur() {
        for (const key of down.current) stream.send({ type: "key", action: "up", key });
        down.current.clear();
      },
    },
  };
}

export function ScreenView({ bot, thread, onBack }: { bot: Bot; thread: Thread; onBack(): void }) {
  const takeOnOpen = useStore((s) => s.screen?.take ?? false);
  const state = useScreenState(bot.id);
  const messages = useStore((s) => s.messages[thread.id]);
  const online = useStore(isConnected);
  const stream = useScreenStream(bot.id, takeOnOpen);
  const keys = useRef<HTMLTextAreaElement>(null);
  const controls = useControls(stream, keys);
  const now = useNow(5_000);
  const controlling = state.controller === "user" && stream.asked;
  const elsewhere = state.controller === "user" && !stream.asked;
  const open = state.status !== "closed";
  const canTake = open && online && !elsewhere;

  const take = () => {
    stream.take();
    keys.current?.focus({ preventScroll: true });
  };
  const handBack = () => {
    stream.release();
    const card = pendingHandOver(messages, bot.id);
    if (card) void settleHandOver(card.messageId, card.index, "done");
  };

  return (
    <section
      className="fixed inset-0 z-40 flex min-w-0 flex-col bg-background animate-in fade-in-0 md:static md:z-auto md:flex-1"
      role="region"
      aria-label={`${bot.name}'s screen`}
    >
      <header className="flex h-14 flex-none items-center gap-2 px-3 md:px-4">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={onBack} aria-label="Back to desk">
          <ChevronLeft className="size-5" />
        </Button>
        <LiveAvatar bot={bot} size={28} />
        <h2 className="flex-none truncate text-[17px] font-semibold">{bot.name}'s screen</h2>
        {controlling ? (
          <p className="hidden min-w-0 flex-1 truncate text-sm md:block">You're in control. {bot.name} is waiting.</p>
        ) : (
          <span className="hidden min-w-0 flex-1 md:flex">
            {open && (
              <span className="max-w-full truncate rounded-full bg-muted px-3 py-1 text-[13px] text-muted-foreground" title={state.url} aria-label="Address">
                {displayUrl(state.url)}
              </span>
            )}
          </span>
        )}
        <span className="flex-1 md:hidden" />
        <StatusChip bot={bot} state={state} controlling={controlling} now={now} className="hidden md:flex" />
        {controlling ? (
          <Button className="hidden rounded-full md:inline-flex" onClick={handBack}>
            Hand back to {bot.name}
          </Button>
        ) : (
          <Button className="hidden rounded-full md:inline-flex" disabled={!canTake} onClick={take}>
            Take control
          </Button>
        )}
        <Button variant="ghost" size="icon" className="rounded-full" onClick={closeScreen} aria-label="Close screen">
          <X className="size-5" />
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 place-items-center bg-neutral-950 p-3 [container-type:size] md:bg-muted/40 md:p-4">
        <div
          className={cn("relative aspect-[16/10] overflow-hidden rounded-xl border bg-muted md:rounded-2xl", controlling && "cursor-default touch-none ring-2 ring-foreground")}
          style={{ width: "min(100cqw, 160cqh)" }}
          {...(controlling ? controls.pointer : {})}
        >
          <ScreenFrame bot={bot} state={state} stream={stream} />
          {!controlling && stream.pointer && (
            <span
              key={stream.pointer.at}
              className="screen-pointer pointer-events-none absolute size-8 -translate-1/2 rounded-full"
              style={{
                left: `${(stream.pointer.x / (stream.canvas.current?.width || 1280)) * 100}%`,
                top: `${(stream.pointer.y / (stream.canvas.current?.height || 800)) * 100}%`,
                background: `color-mix(in srgb, ${bot.color} 35%, transparent)`,
                boxShadow: `0 0 0 2px ${bot.color}`,
              }}
            />
          )}
        </div>
        <textarea
          ref={keys}
          aria-label={`Type on ${bot.name}'s screen`}
          tabIndex={controlling ? 0 : -1}
          className="pointer-events-none fixed top-0 left-0 size-px opacity-0"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          {...(controlling ? controls.keys : {})}
        />
      </div>

      <footer className="flex flex-none flex-col gap-3 p-4 md:hidden">
        <StatusChip bot={bot} state={state} controlling={controlling} now={now} className="self-start bg-muted" />
        {controlling ? (
          <div className="flex gap-2">
            <Button variant="outline" size="icon-lg" className="flex-none rounded-full" onClick={() => keys.current?.focus()} aria-label="Show keyboard">
              <Keyboard className="size-5" />
            </Button>
            <Button size="lg" className="flex-1 rounded-full" onClick={handBack}>
              Hand back to {bot.name}
            </Button>
          </div>
        ) : (
          <Button size="lg" className="w-full rounded-full" disabled={!canTake} onClick={take}>
            Take control
          </Button>
        )}
      </footer>
    </section>
  );
}
