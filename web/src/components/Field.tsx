import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Bot, Routine } from "../../../shared/types";
import { api, formatTime } from "../api";
import { openDirect, openModal, openThread, selectBot, threadTitle, useStore } from "../store";
import { BotAvatar } from "./BotAvatar";
import { Icon } from "./Icon";

/** Hand-placed slots (fractions of the field) so a small team looks composed, not gridded. */
const SLOTS: [number, number][] = [
  [0.3, 0.38],
  [0.58, 0.26],
  [0.72, 0.56],
  [0.42, 0.64],
  [0.16, 0.6],
  [0.84, 0.3],
  [0.14, 0.22],
  [0.58, 0.78],
  [0.86, 0.76],
  [0.3, 0.84],
  [0.44, 0.14],
  [0.54, 0.48],
];
function defaultSlot(i: number): [number, number] {
  if (i < SLOTS.length) return SLOTS[i]!;
  const a = i * 2.39996; // golden angle spiral for big teams
  const r = 0.08 + 0.035 * Math.sqrt(i);
  return [0.5 + Math.cos(a) * r * 1.4, 0.5 + Math.sin(a) * r * 2];
}

const POS_KEY = "fabs.positions";
type Positions = Record<string, [number, number]>;
const loadPositions = (): Positions => {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY) ?? "{}");
  } catch {
    return {};
  }
};

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function Field() {
  const bots = useStore((s) => s.bots);
  const statuses = useStore((s) => s.statuses);
  const links = useStore((s) => s.links);
  const selected = useStore((s) => s.selectedBotId);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [positions, setPositions] = useState<Positions>(loadPositions);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean; x0: number; y0: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pos = (b: Bot, i: number): [number, number] => positions[b.id] ?? defaultSlot(i);
  const px = (b: Bot, i: number) => {
    const [fx, fy] = pos(b, i);
    return { x: fx * size.w, y: fy * size.h };
  };

  function onPointerDown(e: React.PointerEvent, b: Bot, i: number) {
    if (e.button !== 0) return;
    const { x, y } = px(b, i);
    const rect = ref.current!.getBoundingClientRect();
    drag.current = { id: b.id, dx: e.clientX - rect.left - x, dy: e.clientY - rect.top - y, moved: false, x0: e.clientX, y0: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
    d.moved = true;
    const rect = ref.current!.getBoundingClientRect();
    const fx = Math.min(0.97, Math.max(0.03, (e.clientX - rect.left - d.dx) / size.w));
    const fy = Math.min(0.92, Math.max(0.08, (e.clientY - rect.top - d.dy) / size.h));
    setPositions((p) => ({ ...p, [d.id]: [fx, fy] }));
  }
  function onPointerUp(b: Bot) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) setPositions((p) => (localStorage.setItem(POS_KEY, JSON.stringify(p)), p));
    else selectBot(selected === b.id ? null : b.id);
  }

  const index = new Map(bots.map((b, i) => [b.id, i]));

  return (
    <div className="field" ref={ref} role="group" aria-label="Bot field" onClick={(e) => e.target === e.currentTarget && selectBot(null)}>
      <svg className="field-links" width={size.w} height={size.h}>
        {links.map((l) => {
          const a = bots.find((b) => b.id === l.fromBotId);
          const z = bots.find((b) => b.id === l.toBotId);
          if (!a || !z) return null;
          const p1 = px(a, index.get(a.id)!);
          const p2 = px(z, index.get(z.id)!);
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2 - Math.max(40, Math.abs(p1.x - p2.x) * 0.25);
          const d = `M${p1.x} ${p1.y} Q${mx} ${my} ${p2.x} ${p2.y}`;
          return (
            <g key={l.id} className="link" data-link={`${a.name}->${z.name}`} onClick={() => openThread(l.threadId)}>
              <path d={d} className="link-track" />
              <path d={d} className="link-flow" style={{ stroke: a.color }} />
              <circle r="6" fill={a.color}>
                <animateMotion dur="1.6s" repeatCount="indefinite" path={d} />
              </circle>
            </g>
          );
        })}
      </svg>

      {bots.map((b, i) => {
        const { x, y } = px(b, i);
        const st = statuses[b.id];
        const state = st?.state ?? "idle";
        const delay = -(hash(b.id) % 6000) / 1000;
        return (
          <div
            key={b.id}
            role="button"
            tabIndex={0}
            aria-label={`Bot ${b.name}`}
            data-bot-state={state}
            className={`bot-node ${selected === b.id ? "selected" : ""} state-${state}`}
            style={{ left: x, top: y, animationDelay: `${i * 70}ms` }}
            onPointerDown={(e) => onPointerDown(e, b, i)}
            onPointerMove={onPointerMove}
            onPointerUp={() => onPointerUp(b)}
            onDoubleClick={() => void openDirect(b.id)}
          >
            {state !== "idle" && st?.text && (
              <button
                aria-label={`${b.name} status: ${st.text}`}
                className="bot-bubble"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => st.threadId && openThread(st.threadId)}
              >
                {state === "waiting" && <b>Needs you · </b>}
                {st.text}
              </button>
            )}
            <div className="bot-float" style={{ animationDelay: `${delay}s` }}>
              <BotAvatar shape={b.shape} color={b.color} size={92} state={state} dot />
            </div>
            <div className="bot-name">{b.name}</div>
            <div className="bot-sub">{state === "idle" ? b.role || b.provider : state === "error" ? "Hit a snag" : state === "waiting" ? "Needs you" : "Working"}</div>
          </div>
        );
      })}

      {selected && bots.find((b) => b.id === selected) && (
        <BotCard bot={bots.find((b) => b.id === selected)!} anchor={px(bots.find((b) => b.id === selected)!, index.get(selected)!)} field={size} />
      )}
    </div>
  );
}

function BotCard({ bot, anchor, field }: { bot: Bot; anchor: { x: number; y: number }; field: { w: number; h: number } }) {
  const threads = useStore((s) => s.threads);
  const bots = useStore((s) => s.bots);
  const status = useStore((s) => s.statuses[bot.id]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  useEffect(() => {
    api.get<Routine[]>("/api/routines").then((rs) => setRoutines(rs.filter((r) => r.botId === bot.id))).catch(() => {});
  }, [bot.id]);
  const mine = threads.filter((t) => t.memberIds.includes(bot.id)).slice(0, 4);
  const right = anchor.x < field.w * 0.62;
  const style = {
    left: right ? anchor.x + 70 : undefined,
    right: right ? undefined : field.w - anchor.x + 70,
    top: Math.min(Math.max(16, anchor.y - 120), field.h - 380),
  };
  const next = routines.filter((r) => r.enabled && r.nextRunAt).sort((a, b) => a.nextRunAt! - b.nextRunAt!)[0];

  return (
    <div className="bot-card pop-in" role="dialog" aria-label={`${bot.name} card`} style={style} onPointerDown={(e) => e.stopPropagation()}>
      <div className="bot-card-head">
        <BotAvatar shape={bot.shape} color={bot.color} size={44} state={status?.state} />
        <div>
          <div className="bot-card-name">{bot.name}</div>
          <div className="bot-card-role">{bot.role || "No role yet"}</div>
        </div>
      </div>
      <div className="chips">
        <span className="chip">{bot.provider}{bot.model ? ` · ${bot.model}` : ""}</span>
        <span className="chip">{bot.autonomy === "full" ? "Full autonomy" : "Asks first"}</span>
        {next && (
          <span className="chip">
            <Icon name="clock" size={12} /> {formatTime(next.nextRunAt!)}
          </span>
        )}
      </div>
      <div className="bot-card-path" title={bot.cwd}>
        <Icon name="folder" size={14} /> {bot.cwd.replace(/^\/home\/[^/]+/, "~")}
      </div>
      <div className="bot-card-actions">
        <button className="btn-black" onClick={() => void openDirect(bot.id)}>
          Chat
        </button>
        <button className="btn-soft" onClick={() => openModal({ kind: "workspace", botId: bot.id })}>
          <Icon name="monitor" size={16} /> Desk
        </button>
        <button className="btn-soft" onClick={() => openModal({ kind: "bot", botId: bot.id })}>
          <Icon name="edit" size={16} /> Edit
        </button>
      </div>
      {mine.length > 0 && (
        <div className="bot-card-threads">
          {mine.map((t) => (
            <button key={t.id} onClick={() => openThread(t.id)}>
              <span className="t-title">{threadTitle(t, bots)}</span>
              <span className="t-time">{formatTime(t.updatedAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
