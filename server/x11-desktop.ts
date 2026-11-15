import type { Socket } from "bun";

const MAX_REQUEST_BYTES = 262_140;
const OP = { createWindow: 1, mapWindow: 8, internAtom: 16, changeProperty: 18, getInputFocus: 43, createPixmap: 53, createGC: 55, clearArea: 61, putImage: 72 } as const;
const ATOM_TYPE = 4;
const BACKGROUND_PIXMAP = 0x1;
const INPUT_OUTPUT = 1;
const Z_PIXMAP = 2;

type Setup = { root: number; depth: number; idBase: number; idMask: number };

function request(opcode: number, data: number, body: Uint8Array = new Uint8Array()) {
  const padded = Math.ceil(body.length / 4) * 4;
  const out = new Uint8Array(4 + padded);
  const view = new DataView(out.buffer);
  out[0] = opcode;
  out[1] = data;
  view.setUint16(2, (4 + padded) / 4, true);
  out.set(body, 4);
  return out;
}

function words(...values: number[]) {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((v, i) => view.setUint32(i * 4, v >>> 0, true));
  return out;
}

function shorts(...values: number[]) {
  const out = new Uint8Array(values.length * 2);
  const view = new DataView(out.buffer);
  values.forEach((v, i) => view.setUint16(i * 2, v & 0xffff, true));
  return out;
}

const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};

function readSetup(data: Uint8Array): Setup {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const vendorLength = view.getUint16(24, true);
  const formats = view.getUint8(29);
  const screen = 40 + Math.ceil(vendorLength / 4) * 4 + formats * 8;
  return { idBase: view.getUint32(12, true), idMask: view.getUint32(16, true), root: view.getUint32(screen, true), depth: view.getUint8(screen + 38) };
}

class Writer {
  private queue: Uint8Array[] = [];
  constructor(private readonly connection: Socket<undefined>) {}

  end() {
    this.connection.end();
  }

  write(data: Uint8Array) {
    this.queue.push(data);
    this.flush();
  }

  flush() {
    while (this.queue.length) {
      const head = this.queue[0]!;
      const written = this.connection.write(head);
      if (written >= head.length) {
        this.queue.shift();
        continue;
      }
      this.queue[0] = head.subarray(Math.max(written, 0));
      return;
    }
  }
}

export class DesktopWindow {
  private nextId = 0;
  private constructor(
    private readonly out: Writer,
    private readonly setup: Setup,
    private readonly replies: ((reply: Uint8Array) => void)[],
    private readonly width: number,
    private readonly height: number,
    private window = 0,
    private pixmap = 0,
    private gc = 0,
  ) {}

  static async open(display: string, width: number, height: number): Promise<DesktopWindow> {
    const number = display.match(/^:(\d+)/)?.[1];
    if (!number) throw new Error(`can't read display ${display}`);
    let pending = new Uint8Array();
    let setup: Setup | null = null;
    const replies: ((reply: Uint8Array) => void)[] = [];
    let ready: (setup: Setup) => void = () => {};
    let failed: (error: Error) => void = () => {};
    let writer: Writer | null = null;
    const connected = new Promise<Setup>((resolve, reject) => ((ready = resolve), (failed = reject)));
    const socket = await Bun.connect({
      unix: `/tmp/.X11-unix/X${number}`,
      socket: {
        data(_s, chunk) {
          pending = join(pending, chunk);
          if (!setup) {
            if (pending.length < 8) return;
            const length = 8 + new DataView(pending.buffer, pending.byteOffset).getUint16(6, true) * 4;
            if (pending.length < length) return;
            if (pending[0] !== 1) return failed(new Error("Xwayland refused the connection"));
            setup = readSetup(pending.subarray(0, length));
            pending = pending.subarray(length);
            ready(setup);
          }
          while (pending.length >= 32) {
            const extra = pending[0] === 1 ? new DataView(pending.buffer, pending.byteOffset).getUint32(4, true) * 4 : 0;
            if (pending.length < 32 + extra) return;
            const packet = pending.subarray(0, 32 + extra);
            pending = pending.subarray(32 + extra);
            if (packet[0] === 1) replies.shift()?.(packet);
          }
        },
        drain() {
          writer?.flush();
        },
        close() {
          failed(new Error("Xwayland closed the connection"));
        },
      },
    });
    writer = new Writer(socket);
    writer.write(new Uint8Array([0x6c, 0, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    const desktop = new DesktopWindow(writer, await connected, replies, width, height);
    await desktop.create();
    return desktop;
  }

  private id() {
    return (this.setup.idBase | (this.nextId++ & this.setup.idMask)) >>> 0;
  }

  private atom(name: string): Promise<number> {
    const text = new TextEncoder().encode(name);
    const reply = new Promise<Uint8Array>((resolve) => this.replies.push(resolve));
    this.out.write(request(OP.internAtom, 0, join(shorts(text.length, 0), text)));
    return reply.then((r) => new DataView(r.buffer, r.byteOffset).getUint32(8, true));
  }

  private async create() {
    const [windowType, desktopType] = await Promise.all([this.atom("_NET_WM_WINDOW_TYPE"), this.atom("_NET_WM_WINDOW_TYPE_DESKTOP")]);
    const { root, depth } = this.setup;
    this.pixmap = this.id();
    this.gc = this.id();
    this.window = this.id();
    this.out.write(request(OP.createPixmap, depth, join(words(this.pixmap, root), shorts(this.width, this.height))));
    this.out.write(request(OP.createGC, 0, words(this.gc, this.pixmap, 0)));
    this.out.write(
      request(OP.createWindow, depth, join(words(this.window, root), shorts(0, 0, this.width, this.height, 0, INPUT_OUTPUT), words(0, BACKGROUND_PIXMAP, this.pixmap))),
    );
    this.out.write(request(OP.changeProperty, 0, join(words(this.window, windowType, ATOM_TYPE), new Uint8Array([32, 0, 0, 0]), words(1, desktopType))));
    this.out.write(request(OP.mapWindow, 0, words(this.window)));
  }

  paint(pixels: Uint8Array) {
    const rowBytes = this.width * 4;
    const rowsPerRequest = Math.floor((MAX_REQUEST_BYTES - 24) / rowBytes);
    for (let y = 0; y < this.height; y += rowsPerRequest) {
      const rows = Math.min(rowsPerRequest, this.height - y);
      const header = join(words(this.pixmap, this.gc), shorts(this.width, rows, 0, y), new Uint8Array([0, this.setup.depth, 0, 0]));
      this.out.write(request(OP.putImage, Z_PIXMAP, join(header, pixels.subarray(y * rowBytes, (y + rows) * rowBytes))));
    }
    this.out.write(request(OP.clearArea, 0, join(words(this.window), shorts(0, 0, 0, 0))));
    const done = new Promise<void>((resolve) => this.replies.push(() => resolve()));
    this.out.write(request(OP.getInputFocus, 0));
    return done;
  }

  close() {
    this.out.end();
  }
}
