import type { BotState, Shape } from "../../../shared/types";

/** Body silhouettes on a 100×100 canvas, plus where each one's eyes sit. */
const BODIES: Record<Shape, { d: string; eyes: [number, number, number]; rotate?: number }> = {
  blob: { d: "M50 8 C76 8 94 26 94 52 C94 76 76 94 50 94 C24 94 6 76 6 52 C6 26 24 8 50 8 Z", eyes: [52, 40, 1] },
  cloud: {
    d: "M27 84 C12 84 4 72 8 60 C0 50 6 34 20 34 C20 20 34 10 48 16 C58 6 78 10 82 26 C96 28 100 46 92 56 C100 68 92 84 76 84 Z",
    eyes: [50, 48, 1],
  },
  drop: { d: "M50 4 C56 10 86 40 86 64 C86 84 70 96 50 96 C30 96 14 84 14 64 C14 40 44 10 50 4 Z", eyes: [50, 64, 1.05] },
  hex: {
    d: "M42 6 Q50 2 58 6 L86 22 Q94 27 94 36 L94 64 Q94 73 86 78 L58 94 Q50 98 42 94 L14 78 Q6 73 6 64 L6 36 Q6 27 14 22 Z",
    eyes: [50, 50, 1],
  },
  square: { d: "M24 10 L76 14 Q92 15 91 32 L88 74 Q87 90 70 89 L22 86 Q8 85 9 68 L10 26 Q11 9 24 10 Z", eyes: [54, 44, 0.95] },
  egg: { d: "M52 6 C76 8 92 36 90 62 C88 84 70 96 48 94 C26 92 10 78 12 54 C14 28 30 4 52 6 Z", eyes: [50, 42, 1] },
  pill: { d: "M30 26 L70 26 Q94 26 94 50 Q94 74 70 74 L30 74 Q6 74 6 50 Q6 26 30 26 Z", eyes: [56, 44, 0.8] },
  triangle: { d: "M44 12 Q50 2 56 12 L94 78 Q98 90 86 90 L14 90 Q2 90 6 78 Z", eyes: [50, 62, 0.9] },
  flower: {
    d: "M50 6 C60 6 66 16 64 24 C72 18 86 22 88 34 C90 44 82 50 76 52 C84 56 90 66 84 76 C78 86 66 84 60 78 C60 88 54 96 46 94 C36 92 34 82 36 76 C28 84 14 82 12 70 C10 60 18 54 24 52 C16 48 10 38 16 30 C22 20 34 22 38 26 C36 16 40 6 50 6 Z",
    eyes: [50, 46, 0.9],
  },
  bean: { d: "M30 12 C48 4 62 20 70 18 C86 14 98 34 92 56 C86 80 66 94 42 92 C18 90 4 70 8 46 C10 28 18 16 30 12 Z", eyes: [52, 46, 1] },
};

interface Props {
  shape: Shape;
  color: string;
  size?: number;
  state?: BotState;
  /** Show the presence dot (green working, amber waiting, red error). */
  dot?: boolean;
  className?: string;
}

export function BotAvatar({ shape, color, size = 48, state = "idle", dot = false, className = "" }: Props) {
  const body = BODIES[shape] ?? BODIES.blob;
  const [ex, ey, es] = body.eyes;
  return (
    <span className={`bot-avatar state-${state} ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        <g className="bot-body">
          <path d={body.d} fill={color} />
          <g className="bot-eyes" transform={`translate(${ex} ${ey}) scale(${es})`}>
            <g className="bot-eyes-inner">
              <line x1="-7" y1="-8" x2="-10" y2="8" />
              <line x1="11" y1="-8" x2="8" y2="8" />
            </g>
          </g>
        </g>
      </svg>
      {dot && state !== "idle" && <i className={`presence presence-${state}`} />}
    </span>
  );
}

/** Two or three overlapping avatars for group threads. */
export function AvatarStack({ bots, size = 48 }: { bots: { shape: Shape; color: string; id: string }[]; size?: number }) {
  if (bots.length <= 1) {
    const b = bots[0];
    return b ? <BotAvatar shape={b.shape} color={b.color} size={size} /> : <span style={{ width: size, height: size }} />;
  }
  const small = Math.round(size * 0.58);
  const spots = [
    { left: size * 0.22, top: 0 },
    { left: 0, top: size * 0.42 },
    { left: size * 0.44, top: size * 0.42 },
  ];
  return (
    <span className="avatar-stack" style={{ width: size, height: size }}>
      {bots.slice(0, 3).map((b, i) => (
        <span key={b.id} style={{ position: "absolute", ...spots[i] }}>
          <BotAvatar shape={b.shape} color={b.color} size={small} />
        </span>
      ))}
    </span>
  );
}
