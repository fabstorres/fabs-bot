import type { Socket } from "bun";

const DISPLAY_ID = 1;
const REGISTRY_ID = 2;
const SYNC_ID = 3;
const FAKE_INPUT_ID = 4;
const FAKE_INPUT = "org_kde_kwin_fake_input";

const REQUEST = { authenticate: 0, button: 2, axis: 3, pointerAbsolute: 9, key: 10 } as const;

export const BUTTONS = { left: 0x110, right: 0x111, middle: 0x112 } as const;
export type ButtonName = keyof typeof BUTTONS;

type Arg = number | string | { fixed: number };

function encode(objectId: number, opcode: number, args: Arg[]): Uint8Array {
  const words: Uint8Array[] = args.map((arg) => {
    if (typeof arg === "string") {
      const text = new TextEncoder().encode(`${arg}\0`);
      const out = new Uint8Array(4 + Math.ceil(text.length / 4) * 4);
      new DataView(out.buffer).setUint32(0, text.length, true);
      out.set(text, 4);
      return out;
    }
    const out = new Uint8Array(4);
    if (typeof arg === "number") new DataView(out.buffer).setUint32(0, arg >>> 0, true);
    else new DataView(out.buffer).setInt32(0, Math.round(arg.fixed * 256), true);
    return out;
  });
  const size = 8 + words.reduce((n, w) => n + w.length, 0);
  const message = new Uint8Array(size);
  const view = new DataView(message.buffer);
  view.setUint32(0, objectId, true);
  view.setUint32(4, (size << 16) | opcode, true);
  let offset = 8;
  for (const w of words) {
    message.set(w, offset);
    offset += w.length;
  }
  return message;
}

function readGlobal(body: Uint8Array) {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const name = view.getUint32(0, true);
  const length = view.getUint32(4, true);
  const iface = new TextDecoder().decode(body.subarray(8, 8 + length - 1));
  const version = view.getUint32(8 + Math.ceil(length / 4) * 4, true);
  return { name, iface, version };
}

export class FakeInput {
  private constructor(private readonly socket: Socket<undefined>) {}

  static async connect(path: string): Promise<FakeInput> {
    let pending = new Uint8Array();
    let found: { name: number; version: number } | null = null;
    let settle: (error?: Error) => void = () => {};
    const synced = new Promise<void>((resolve, reject) => (settle = (error) => (error ? reject(error) : resolve())));
    const socket = await Bun.connect({
      unix: path,
      socket: {
        data(_s, chunk) {
          const all = new Uint8Array(pending.length + chunk.length);
          all.set(pending);
          all.set(chunk, pending.length);
          pending = all;
          while (pending.length >= 8) {
            const view = new DataView(pending.buffer, pending.byteOffset, pending.byteLength);
            const objectId = view.getUint32(0, true);
            const header = view.getUint32(4, true);
            const size = header >>> 16;
            if (pending.length < size) break;
            const body = pending.subarray(8, size);
            if (objectId === REGISTRY_ID && (header & 0xffff) === 0) {
              const g = readGlobal(body);
              if (g.iface === FAKE_INPUT) found = g;
            }
            if (objectId === SYNC_ID) settle();
            if (objectId === DISPLAY_ID && (header & 0xffff) === 0) settle(new Error("the compositor refused fake input"));
            pending = pending.subarray(size);
          }
        },
        close() {
          settle(new Error("the compositor closed the connection"));
        },
      },
    });
    socket.write(encode(DISPLAY_ID, 1, [REGISTRY_ID]));
    socket.write(encode(DISPLAY_ID, 0, [SYNC_ID]));
    await synced;
    const g = found as { name: number; version: number } | null;
    if (!g) {
      socket.end();
      throw new Error(`the compositor has no ${FAKE_INPUT}`);
    }
    socket.write(encode(REGISTRY_ID, 0, [g.name, FAKE_INPUT, g.version, FAKE_INPUT_ID]));
    socket.write(encode(FAKE_INPUT_ID, REQUEST.authenticate, ["Fabs Bot", "A bot's computer"]));
    return new FakeInput(socket);
  }

  move(x: number, y: number) {
    this.socket.write(encode(FAKE_INPUT_ID, REQUEST.pointerAbsolute, [{ fixed: x }, { fixed: y }]));
  }

  button(name: ButtonName, down: boolean) {
    this.socket.write(encode(FAKE_INPUT_ID, REQUEST.button, [BUTTONS[name], down ? 1 : 0]));
  }

  scroll(axis: "vertical" | "horizontal", value: number) {
    this.socket.write(encode(FAKE_INPUT_ID, REQUEST.axis, [axis === "vertical" ? 0 : 1, { fixed: value }]));
  }

  key(code: number, down: boolean) {
    this.socket.write(encode(FAKE_INPUT_ID, REQUEST.key, [code, down ? 1 : 0]));
  }

  close() {
    this.socket.end();
  }
}

const SHIFT = 42;
export const TYPING_SHIFT = 54;

const ROWS: [string, number][] = [
  ["1234567890-=", 2],
  ["qwertyuiop[]", 16],
  ["asdfghjkl;'`", 30],
  ["\\zxcvbnm,./", 43],
];
const SHIFTED_ROWS: [string, string][] = [
  ["!@#$%^&*()_+", "1234567890-="],
  ["{}", "[]"],
  [':"~', ";'`"],
  ["|<>?", "\\,./"],
];

const PLAIN = new Map<string, number>(ROWS.flatMap(([chars, first]) => [...chars].map((c, i) => [c, first + i] as [string, number])));
const SHIFTED = new Map<string, string>(SHIFTED_ROWS.flatMap(([shifted, plain]) => [...shifted].map((c, i) => [c, plain[i]!] as [string, string])));

const NAMED: Record<string, number> = {
  escape: 1, esc: 1, backspace: 14, tab: 15, enter: 28, return: 28, space: 57, " ": 57,
  control: 29, ctrl: 29, shift: SHIFT, alt: 56, meta: 125, super: 125, win: 125, cmd: 125, altgr: 100, altgraph: 100,
  capslock: 58, numlock: 69, scrolllock: 70, printscreen: 99, print: 99, pause: 119, contextmenu: 127, menu: 127,
  home: 102, arrowup: 103, up: 103, pageup: 104, arrowleft: 105, left: 105, arrowright: 106, right: 106,
  end: 107, arrowdown: 108, down: 108, pagedown: 109, insert: 110, delete: 111, del: 111,
  f1: 59, f2: 60, f3: 61, f4: 62, f5: 63, f6: 64, f7: 65, f8: 66, f9: 67, f10: 68, f11: 87, f12: 88,
};

export function keyCode(name: string): number | null {
  if (name.length === 1) {
    const lower = name.toLowerCase();
    return PLAIN.get(lower) ?? PLAIN.get(SHIFTED.get(name) ?? "") ?? NAMED[name] ?? null;
  }
  return NAMED[name.toLowerCase()] ?? null;
}

export type Stroke = { code: number; shift: boolean };

export function strokeFor(char: string): Stroke | null {
  if (char === "\n") return { code: NAMED.enter!, shift: false };
  if (char === "\t") return { code: NAMED.tab!, shift: false };
  if (char === " ") return { code: NAMED.space!, shift: false };
  if (PLAIN.has(char)) return { code: PLAIN.get(char)!, shift: false };
  if (/^[A-Z]$/.test(char)) return { code: PLAIN.get(char.toLowerCase())!, shift: true };
  const plain = SHIFTED.get(char);
  return plain ? { code: PLAIN.get(plain)!, shift: true } : null;
}

export function strokesFor(text: string): Stroke[] {
  const chars = [...text.replace(/\r\n?/g, "\n")];
  const missing = [...new Set(chars.filter((c) => !strokeFor(c)))];
  if (missing.length) throw new Error(`Can't type ${missing.slice(0, 5).map((c) => JSON.stringify(c)).join(", ")}: only characters on a US keyboard can be typed.`);
  return chars.map((c) => strokeFor(c)!);
}

export function chordCodes(keys: string): number[] {
  const parts = keys.trim() === "+" ? ["+"] : keys.split(/\s*\+\s*/).map((p, i, all) => (p === "" && i === all.length - 1 ? "+" : p)).filter(Boolean);
  if (!parts.length) throw new Error("Pass a key, e.g. Enter or ctrl+s.");
  return parts.flatMap((part) => {
    const named = keyCode(part);
    if (named !== null && (part.length > 1 || !SHIFTED.has(part))) return [named];
    const stroke = strokeFor(part);
    if (!stroke) throw new Error(`Unknown key "${part}". Use names like Enter, Escape, Tab, ArrowUp, F5, ctrl, alt, shift or a single US keyboard character.`);
    return stroke.shift ? [SHIFT, stroke.code] : [stroke.code];
  });
}
