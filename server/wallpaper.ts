type Palette = { top: number; bottom: number; sheen: number; tint: [number, number, number] };

const STEPS: { fromHour: number; palette: Palette }[] = [
  { fromHour: 0, palette: { top: 50, bottom: 30, sheen: 90, tint: [-4, 0, 5] } },
  { fromHour: 6, palette: { top: 226, bottom: 186, sheen: 253, tint: [-3, 0, 3] } },
  { fromHour: 12, palette: { top: 212, bottom: 170, sheen: 246, tint: [-4, 0, 4] } },
  { fromHour: 18, palette: { top: 156, bottom: 112, sheen: 210, tint: [-5, 0, 5] } },
  { fromHour: 21, palette: { top: 66, bottom: 42, sheen: 110, tint: [-4, 0, 5] } },
];

const SHEEN_ANGLE = (32 * Math.PI) / 180;
const STREAK_LEVELS = 2.2;
const STREAK_PX = 240;
const SEED = 0x5eed;

export function stepAt(date: Date): number {
  return STEPS.findLastIndex((s) => date.getHours() >= s.fromHour);
}

export const STEP_COUNT = STEPS.length;

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function streakRow(width: number, next: () => number) {
  const knots = Array.from({ length: Math.ceil(width / STREAK_PX) + 2 }, () => next() * 2 - 1);
  const offset = next() * 2 - 1;
  const row = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const at = x / STREAK_PX;
    const i = Math.floor(at);
    const t = at - i;
    const along = knots[i]! + (knots[i + 1]! - knots[i]!) * t * t * (3 - 2 * t);
    row[x] = (0.55 * along + 0.45 * offset) * STREAK_LEVELS;
  }
  return row;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function renderWallpaper(width: number, height: number, step: number): Uint8Array {
  const { top, bottom, sheen, tint } = STEPS[step]!.palette;
  const diagonal = Math.hypot(width, height);
  const across = [Math.sin(SHEEN_ANGLE), Math.cos(SHEEN_ANGLE)];
  const band = (x: number, y: number, cx: number, cy: number, width: number) => {
    const d = ((x - cx) * across[0]! + (y - cy) * across[1]!) / (diagonal * width);
    return Math.exp(-d * d);
  };
  const next = random(SEED);
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const streaks = streakRow(width, next);
    for (let x = 0; x < width; x++) {
      const along = (x / width) * 0.35 + (y / height) * 0.65;
      const light = Math.min(0.55 * band(x, y, width * 0.34, height * 0.42, 0.2) + 0.2 * band(x, y, width * 0.34, height * 0.42, 0.06) + 0.25 * band(x, y, width * 0.86, height * 0.78, 0.08), 1);
      const level = Math.round(mix(mix(top, bottom, along), sheen, light) + streaks[x]!);
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) pixels[i + 2 - c] = Math.max(0, Math.min(255, level + tint[c]!));
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}
