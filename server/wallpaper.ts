type Rgb = [number, number, number];
type Palette = { from: Rgb; to: Rgb; glow: Rgb; glowStrength: number };

const DAY: Palette = { from: [0xe8, 0xe9, 0xeb], to: [0xbf, 0xc3, 0xc8], glow: [0xff, 0xff, 0xff], glowStrength: 0.7 };
const NIGHT: Palette = { from: [0x17, 0x19, 0x1d], to: [0x30, 0x35, 0x3d], glow: [0x50, 0x57, 0x62], glowStrength: 0.55 };

const STEPS: { fromHour: number; night: number }[] = [
  { fromHour: 0, night: 1 },
  { fromHour: 6, night: 0 },
  { fromHour: 12, night: 0.2 },
  { fromHour: 18, night: 0.6 },
  { fromHour: 21, night: 1 },
];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

export function nightAt(date: Date): number {
  return STEPS.findLast((s) => date.getHours() >= s.fromHour)!.night;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function glow(x: number, y: number, cx: number, cy: number, radius: number) {
  const falloff = Math.max(0, 1 - Math.hypot(x - cx, y - cy) / radius);
  return falloff * falloff * (3 - 2 * falloff);
}

export function renderWallpaper(width: number, height: number, night: number): Uint8Array {
  const palette = {
    from: mixRgb(DAY.from, NIGHT.from, night),
    to: mixRgb(DAY.to, NIGHT.to, night),
    glow: mixRgb(DAY.glow, NIGHT.glow, night),
    glowStrength: mix(DAY.glowStrength, NIGHT.glowStrength, night),
  };
  const diagonal = Math.hypot(width, height);
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const along = (x / width) * 0.6 + (y / height) * 0.4;
      const base = mixRgb(palette.from, palette.to, along);
      const light = glow(x, y, width * 0.16, height * 0.08, diagonal * 0.62) * palette.glowStrength + glow(x, y, width * 0.98, height * 0.7, diagonal * 0.45) * palette.glowStrength * 0.3;
      const color = mixRgb(base, palette.glow, Math.min(light, 1));
      const dither = BAYER[(y % 4) * 4 + (x % 4)]!;
      const i = (y * width + x) * 4;
      pixels[i] = Math.round(color[2] + dither);
      pixels[i + 1] = Math.round(color[1] + dither);
      pixels[i + 2] = Math.round(color[0] + dither);
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}
