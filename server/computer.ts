import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import type { Subprocess } from "bun";
import type { ScreenState } from "../shared/types";
import { publish } from "./bus";
import { DATA_DIR } from "./config";
import { type ButtonName, type Stroke, chordCodes, FakeInput, keyCode, strokeFor, strokesFor, TYPING_SHIFT } from "./fake-input";
import type { Viewer } from "./screen";
import { renderWallpaper, stepAt } from "./wallpaper";
import { DesktopWindow } from "./x11-desktop";

export const COMPUTER_SIZE = { width: 1280, height: 800 };
const IDLE_MS = 30 * 60_000;
const FRAME_EVERY_MS = 200;
const SETTLE_MS = 700;
const OPEN_SETTLE_MS = 2_000;
const START_TIMEOUT_MS = 15_000;
const WALLPAPER_TIMEOUT_MS = 5_000;
const STOP_TIMEOUT_MS = 3_000;
const KEY_GAP_MS = 8;
const WHEEL_STEP = 15;
const WHEEL_PER_PIXEL = 0.15;
const TYPE_MAX = 5_000;
const SYSTEM_PATH = `/usr/bin:/bin:${process.env.PATH ?? ""}`;
const KWINRC = "[Wayland]\nInputMethod=\nVirtualKeyboardEnabled=false\n";
const INHERITED_SESSION_VARS = [
  "DISPLAY", "XAUTHORITY", "WAYLAND_SOCKET", "DBUS_SESSION_BUS_ADDRESS", "SESSION_MANAGER",
  "PULSE_SERVER", "PIPEWIRE_REMOTE", "DESKTOP_STARTUP_ID", "XDG_ACTIVATION_TOKEN", "ELECTRON_RUN_AS_NODE",
];

export class ComputerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const fail = (code: string, message: string): never => {
  throw new ComputerError(code, message);
};

const firstLine = (e: unknown) => String((e as Error)?.message ?? e).split("\n")[0]!.replace(/^\w+Error: /, "");

const which = (name: string) => Bun.which(name, { PATH: SYSTEM_PATH });

export type ComputerSupport = "ready" | "not-linux" | "no-kwin";

function programs() {
  const override = process.env.FABS_KWIN;
  const kwin = override ? (existsSync(override) ? override : null) : which("kwin_wayland");
  return { kwin, dbus: which("dbus-run-session"), busctl: which("busctl"), setsid: which("setsid") };
}

export function computerSupport(): ComputerSupport {
  if (platform() !== "linux") return "not-linux";
  return process.env.XDG_RUNTIME_DIR && Object.values(programs()).every(Boolean) ? "ready" : "no-kwin";
}

export const computerDir = (botId: string) => join(DATA_DIR, "computers", botId);

type Computer = {
  botId: string;
  tree: Subprocess;
  runtime: string;
  env: Record<string, string | undefined>;
  bus: string;
  busctl: string;
  setsid: string;
  input: FakeInput;
  apps: Set<number>;
  queue: Promise<unknown>;
  typing: Promise<unknown>;
  heldKeys: Set<number>;
  heldButtons: Set<ButtonName>;
  controller: Viewer | null;
  usedAt: number;
  streaming: boolean;
  frameHash: number | bigint | null;
  wallpaper: DesktopWindow | null;
  wallpaperStep: number;
};

const computers = new Map<string, Computer>();
const starting = new Map<string, Promise<Computer>>();
const states = new Map<string, ScreenState>();
const viewers = new Map<string, Set<Viewer>>();
const lastFrames = new Map<string, Uint8Array>();

const viewersOf = (botId: string) => viewers.get(botId) ?? new Set<Viewer>();

export function computerState(botId: string): ScreenState {
  return states.get(botId) ?? { botId, status: "closed", url: "", title: "", controller: "bot", activeAt: 0, updatedAt: 0 };
}

export const listComputers = () => [...states.values()];
export const isComputerOn = (botId: string) => computers.has(botId);
export const isComputerOpen = (botId: string) => computers.has(botId) || starting.has(botId);

function update(botId: string, patch: Partial<Omit<ScreenState, "botId">>) {
  const next: ScreenState = { ...computerState(botId), ...patch, botId, updatedAt: Date.now() };
  states.set(botId, next);
  publish({ type: "computer", computer: next });
}

function push(v: Viewer, frame: Uint8Array) {
  if (!v.ready) {
    v.pending = frame;
    return;
  }
  v.ready = false;
  v.send(frame);
}

function deliver(botId: string, frame: Uint8Array) {
  lastFrames.set(botId, frame);
  for (const v of viewersOf(botId)) push(v, frame);
}

function broadcast(botId: string, message: object) {
  const text = JSON.stringify(message);
  for (const v of viewersOf(botId)) v.send(text);
}

const tellControl = (v: Viewer, mine: boolean) => v.send(JSON.stringify({ type: "control", mine }));

const watchdog = (serverPid: number) => `#!/bin/sh
printf '%s\\n%s\\n' "$DISPLAY" "$DBUS_SESSION_BUS_ADDRESS" > "$XDG_RUNTIME_DIR/session"
while kill -0 ${serverPid} 2>/dev/null; do sleep 2; done
trap '' TERM
apps=$(cat "$XDG_RUNTIME_DIR/apps" 2>/dev/null)
for group in $apps; do kill -TERM -"$group" 2>/dev/null; done
(sleep 2; for group in $apps; do kill -KILL -"$group" 2>/dev/null; done; rm -rf "$XDG_RUNTIME_DIR"; kill -KILL 0) &
kill -TERM 0
`;

function sessionEnv(home: string, runtime: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of INHERITED_SESSION_VARS) delete env[name];
  return {
    ...env,
    XDG_RUNTIME_DIR: runtime,
    WAYLAND_DISPLAY: "wayland-0",
    XDG_SESSION_TYPE: "wayland",
    XDG_CURRENT_DESKTOP: "KDE",
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_DATA_HOME: join(home, "data"),
    XDG_CACHE_HOME: join(home, "cache"),
    XDG_STATE_HOME: join(home, "state"),
    QT_QPA_PLATFORM: "wayland",
    XKB_DEFAULT_LAYOUT: "us",
    GVFS_DISABLE_FUSE: "1",
    KWIN_WAYLAND_NO_PERMISSION_CHECKS: "1",
    KWIN_SCREENSHOT_NO_PERMISSION_CHECKS: "1",
  };
}

const killTree = (pid: number, signal: NodeJS.Signals) => {
  try {
    process.kill(-pid, signal);
  } catch {}
};

function groupEmpty(pgid: number) {
  try {
    process.kill(-pgid, 0);
    return false;
  } catch {
    return true;
  }
}

async function groupGone(pgid: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (groupEmpty(pgid)) return true;
    await Bun.sleep(100);
  }
  return false;
}

async function removeRuntime(dir: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      await Bun.sleep(300);
    }
  }
}

function logTail(path: string, from = 0) {
  if (!existsSync(path)) return "";
  return readFileSync(path).subarray(from).toString("utf8").trim().split("\n").slice(-4).join("\n").slice(-400);
}

async function waitForSession(tree: Subprocess, file: string) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline && tree.exitCode === null) {
    const [display = "", bus = ""] = existsSync(file) ? readFileSync(file, "utf8").split("\n") : [];
    if (bus) return { display, bus };
    await Bun.sleep(100);
  }
  return null;
}

async function showWallpaper(display: string, step: number) {
  const { width, height } = COMPUTER_SIZE;
  const opening = DesktopWindow.open(display, width, height).catch(() => null);
  const wallpaper = await Promise.race([opening, Bun.sleep(WALLPAPER_TIMEOUT_MS).then(() => null)]);
  if (!wallpaper) void opening.then((late) => late?.close());
  if (wallpaper) await Promise.race([wallpaper.paint(renderWallpaper(width, height, step)), Bun.sleep(WALLPAPER_TIMEOUT_MS)]);
  await Bun.sleep(FRAME_EVERY_MS);
  return wallpaper;
}

async function launch(botId: string): Promise<Computer> {
  const support = computerSupport();
  if (support === "not-linux") return fail("unsupported", "Computer use only works when Fabs Bot runs on Linux.");
  const { kwin, dbus, busctl, setsid } = programs();
  if (support !== "ready" || !kwin || !dbus || !busctl || !setsid) {
    return fail("no_kwin", "KWin isn't installed on this PC, so your computer can't start. Ask the user to install KDE's kwin_wayland.");
  }
  const home = computerDir(botId);
  for (const dir of ["config", "data", "cache", "state"]) mkdirSync(join(home, dir), { recursive: true });
  const kwinrc = join(home, "config", "kwinrc");
  if (!existsSync(kwinrc)) writeFileSync(kwinrc, KWINRC);
  const runtime = mkdtempSync(join(process.env.XDG_RUNTIME_DIR!, "fabs-computer-"));
  const script = join(runtime, "watchdog");
  writeFileSync(script, watchdog(process.pid), { mode: 0o755 });
  const env = sessionEnv(home, runtime);
  const logPath = join(home, "session.log");
  const log = openSync(logPath, "w");
  update(botId, { status: "loading", controller: "bot" });
  const { width, height } = COMPUTER_SIZE;
  const tree = Bun.spawn(
    [setsid, dbus, "--", kwin, "--virtual", "--xwayland", "--no-lockscreen", "--no-kactivities", "--width", String(width), "--height", String(height), "--socket", "wayland-0", "--exit-with-session", script],
    { env, stdio: ["ignore", log, log] },
  );
  closeSync(log);
  const abort = (detail: string): never => {
    killTree(tree.pid, "SIGKILL");
    void removeRuntime(runtime);
    update(botId, { status: "closed" });
    return fail("start_failed", `Your computer didn't start: ${detail}`);
  };
  const session = await waitForSession(tree, join(runtime, "session"));
  if (!session) return abort(logTail(logPath) || "KWin didn't open its display in time.");
  const input = await FakeInput.connect(join(runtime, "wayland-0")).catch((e) => abort(firstLine(e)));
  const wallpaperStep = stepAt(new Date());
  const wallpaper = session.display ? await showWallpaper(session.display, wallpaperStep) : null;
  const appEnv = { ...env, DBUS_SESSION_BUS_ADDRESS: session.bus, ...(session.display ? { DISPLAY: session.display } : {}) };
  const c: Computer = {
    botId,
    tree,
    runtime,
    env: appEnv,
    bus: session.bus,
    busctl,
    setsid,
    input,
    apps: new Set(),
    queue: Promise.resolve(),
    typing: Promise.resolve(),
    heldKeys: new Set(),
    heldButtons: new Set(),
    controller: null,
    usedAt: Date.now(),
    streaming: false,
    frameHash: null,
    wallpaper,
    wallpaperStep,
  };
  computers.set(botId, c);
  void tree.exited.then(() => {
    if (computers.get(botId) === c) void stop(c);
  });
  update(botId, { status: "live" });
  void stream(c);
  return c;
}

async function ensure(botId: string): Promise<Computer> {
  const on = computers.get(botId);
  if (on) return on;
  const pending = starting.get(botId) ?? launch(botId).finally(() => starting.delete(botId));
  starting.set(botId, pending);
  return pending;
}

async function stop(c: Computer) {
  if (computers.get(c.botId) === c) computers.delete(c.botId);
  c.input.close();
  c.wallpaper?.close();
  const groups = [c.tree.pid, ...c.apps];
  for (const pgid of groups) killTree(pgid, "SIGTERM");
  const stopped = await Promise.all(groups.map((pgid) => groupGone(pgid, STOP_TIMEOUT_MS)));
  groups.forEach((pgid, i) => stopped[i] || killTree(pgid, "SIGKILL"));
  await removeRuntime(c.runtime);
  if (c.controller) tellControl(c.controller, false);
  c.controller = null;
  if (!computers.has(c.botId) && !starting.has(c.botId)) update(c.botId, { status: "closed", controller: "bot" });
}

type Shot = { pixels: Uint8Array; width: number; height: number; stride: number; hash: number | bigint };

async function capture(c: Computer): Promise<Shot> {
  const call = `exec '${c.busctl}' "--address=$1" call org.kde.KWin /org/kde/KWin/ScreenShot2 org.kde.KWin.ScreenShot2 CaptureWorkspace 'a{sv}h' 0 3 3>&1 1>&2`;
  const proc = Bun.spawn(["sh", "-c", call, "sh", c.bus], { stdio: ["ignore", "pipe", "pipe"] });
  const [pixels, reply, code] = await Promise.all([new Response(proc.stdout).arrayBuffer(), new Response(proc.stderr).text(), proc.exited]);
  const field = (name: string) => Number(reply.match(new RegExp(`"${name}" u (\\d+)`))?.[1] ?? 0);
  const shot = { pixels: new Uint8Array(pixels), width: field("width"), height: field("height"), stride: field("stride") };
  if (code !== 0 || !shot.width || shot.pixels.length < shot.stride * shot.height) return fail("capture_failed", `Couldn't see your computer's screen: ${firstLine(reply) || "no picture"}`);
  return { ...shot, hash: Bun.hash(shot.pixels) };
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function pngChunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, Bun.hash.crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodePng({ pixels, width, height, stride }: Omit<Shot, "hash">): Uint8Array {
  const rowSize = 1 + width * 3;
  const rows = new Uint8Array(height * rowSize);
  for (let y = 0; y < height; y++) {
    let o = y * rowSize + 1;
    for (let x = 0; x < width; x++) {
      const i = y * stride + x * 4;
      rows[o++] = pixels[i + 2]!;
      rows[o++] = pixels[i + 1]!;
      rows[o++] = pixels[i]!;
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([PNG_SIGNATURE, pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(rows, { level: 3 })), pngChunk("IEND", new Uint8Array())]);
}

async function stream(c: Computer) {
  if (c.streaming) return;
  c.streaming = true;
  while (computers.get(c.botId) === c && viewersOf(c.botId).size) {
    const shot = await capture(c).catch(() => null);
    if (shot && shot.hash !== c.frameHash) {
      c.frameHash = shot.hash;
      deliver(c.botId, encodePng(shot));
    }
    await Bun.sleep(FRAME_EVERY_MS);
  }
  c.streaming = false;
}

const USER_HAS_CONTROL = "The user has control of your computer right now. Wait until they hand it back, or ask in chat.";
const USER_TOOK_CONTROL = "The user took control of your computer partway through, so the rest wasn't done. Wait until they hand it back, or ask in chat.";
const IS_OFF = "Your computer is off. Start a program with computer_open first.";

async function asBot<T>(botId: string, act: (c: Computer) => Promise<T>, opts: { start?: boolean } = {}): Promise<T> {
  const c = opts.start ? await ensure(botId) : computers.get(botId);
  if (!c) return fail("off", IS_OFF);
  const run = c.queue.then(async () => {
    if (computers.get(botId) !== c) return fail("off", IS_OFF);
    if (c.controller) return fail("user_has_control", USER_HAS_CONTROL);
    c.usedAt = Date.now();
    update(botId, { activeAt: Date.now() });
    try {
      return await act(c);
    } catch (e) {
      if (e instanceof ComputerError) throw e;
      return fail("action_failed", firstLine(e));
    }
  });
  c.queue = run.catch(() => {});
  return run;
}

async function look(c: Computer, waitMs: number) {
  if (waitMs) await Bun.sleep(waitMs);
  return encodePng(await capture(c));
}

function onScreen(x: number, y: number) {
  const { width, height } = COMPUTER_SIZE;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= width || y >= height) {
    return fail("off_screen", `(${x}, ${y}) is off the screen. Use pixels from the top-left of the ${width}x${height} screenshot.`);
  }
  return { x: Math.round(x), y: Math.round(y) };
}

function pointAt(c: Computer, x: number, y: number) {
  broadcast(c.botId, { type: "pointer", x, y });
  c.input.move(x, y);
}

async function typeStrokes(c: Computer, strokes: Stroke[], allowed: () => boolean) {
  for (const s of strokes) {
    if (!allowed()) return false;
    if (s.shift) c.input.key(TYPING_SHIFT, true);
    c.input.key(s.code, true);
    c.input.key(s.code, false);
    if (s.shift) c.input.key(TYPING_SHIFT, false);
    await Bun.sleep(KEY_GAP_MS);
  }
  return true;
}

function trackGroup(c: Computer, pgid: number) {
  c.apps = new Set([...[...c.apps].filter((g) => !groupEmpty(g)), pgid]);
  writeFileSync(join(c.runtime, "apps"), [...c.apps].join("\n"));
}

export function openProgram(botId: string, command: string, cwd: string) {
  const line = command.trim();
  if (!line) return fail("no_command", "Pass the program to start, e.g. kwrite notes.txt.");
  return asBot(
    botId,
    async (c) => {
      const logPath = join(computerDir(botId), "programs.log");
      const from = existsSync(logPath) ? statSync(logPath).size : 0;
      const log = openSync(logPath, "a");
      const app = Bun.spawn([c.setsid, "sh", "-c", line], { cwd: existsSync(cwd) ? cwd : homedir(), env: c.env, stdio: ["ignore", log, log] });
      closeSync(log);
      trackGroup(c, app.pid);
      const exitCode = await Promise.race([app.exited, Bun.sleep(OPEN_SETTLE_MS).then(() => null)]);
      return { image: await look(c, 0), exitCode, output: exitCode ? logTail(logPath, from) : "" };
    },
    { start: true },
  );
}

export function screenshot(botId: string) {
  return asBot(botId, (c) => look(c, 0));
}

export function click(botId: string, x: number, y: number, button: ButtonName, double: boolean) {
  const at = onScreen(x, y);
  return asBot(botId, async (c) => {
    pointAt(c, at.x, at.y);
    await Bun.sleep(50);
    for (let i = 0; i < (double ? 2 : 1); i++) {
      c.input.button(button, true);
      await Bun.sleep(30);
      c.input.button(button, false);
      await Bun.sleep(60);
    }
    return look(c, SETTLE_MS);
  });
}

export function typeText(botId: string, text: string) {
  if (!text) return fail("no_text", "Pass the text to type.");
  if (text.length > TYPE_MAX) return fail("too_long", `That's ${text.length} characters; type at most ${TYPE_MAX} at a time.`);
  let strokes: Stroke[] = [];
  try {
    strokes = strokesFor(text);
  } catch (e) {
    return fail("cannot_type", firstLine(e));
  }
  return asBot(botId, async (c) => {
    if (!(await typeStrokes(c, strokes, () => !c.controller))) fail("user_has_control", USER_TOOK_CONTROL);
    return look(c, SETTLE_MS);
  });
}

export function pressKeys(botId: string, keys: string) {
  let codes: number[] = [];
  try {
    codes = chordCodes(keys);
  } catch (e) {
    return fail("unknown_key", firstLine(e));
  }
  return asBot(botId, async (c) => {
    for (const code of codes) {
      c.input.key(code, true);
      await Bun.sleep(20);
    }
    for (const code of [...codes].reverse()) {
      c.input.key(code, false);
      await Bun.sleep(20);
    }
    return look(c, SETTLE_MS);
  });
}

export function scroll(botId: string, x: number, y: number, direction: "up" | "down" | "left" | "right", notches: number) {
  const at = onScreen(x, y);
  return asBot(botId, async (c) => {
    pointAt(c, at.x, at.y);
    await Bun.sleep(50);
    const axis = direction === "up" || direction === "down" ? "vertical" : "horizontal";
    const sign = direction === "up" || direction === "left" ? -1 : 1;
    for (let i = 0; i < notches; i++) {
      if (c.controller) return fail("user_has_control", USER_TOOK_CONTROL);
      c.input.scroll(axis, sign * WHEEL_STEP);
      await Bun.sleep(30);
    }
    return look(c, SETTLE_MS);
  });
}

export async function closeComputer(botId: string) {
  await starting.get(botId)?.catch(() => null);
  const c = computers.get(botId);
  if (!c) return false;
  await stop(c);
  return true;
}

export function closeForBot(botId: string) {
  if (!computers.has(botId)) return Promise.resolve(false);
  return asBot(botId, async () => closeComputer(botId));
}

export async function forgetComputer(botId: string) {
  await closeComputer(botId);
  states.delete(botId);
  lastFrames.delete(botId);
  rmSync(computerDir(botId), { recursive: true, force: true });
}

export async function closeAllComputers() {
  await Promise.all([...new Set([...computers.keys(), ...starting.keys()])].map(closeComputer));
}

export function releaseComputer(botId: string) {
  const c = computers.get(botId);
  const owner = c?.controller;
  if (!c || !owner) return;
  for (const button of c.heldButtons) c.input.button(button, false);
  for (const code of c.heldKeys) c.input.key(code, false);
  c.heldButtons.clear();
  c.heldKeys.clear();
  c.controller = null;
  tellControl(owner, false);
  update(botId, { controller: "bot" });
}

export function watchComputer(v: Viewer) {
  viewers.set(v.botId, viewersOf(v.botId).add(v));
  v.send(JSON.stringify({ type: "hello", ...COMPUTER_SIZE }));
  const c = computers.get(v.botId);
  const last = lastFrames.get(v.botId);
  if (c && last) push(v, last);
  if (c) void stream(c);
}

export function unwatchComputer(v: Viewer) {
  viewersOf(v.botId).delete(v);
  if (computers.get(v.botId)?.controller === v) releaseComputer(v.botId);
}

type ViewerMessage =
  | { type: "ack" }
  | { type: "take" }
  | { type: "release" }
  | { type: "mouse"; action: "down" | "up" | "move"; x: number; y: number; button?: ButtonName }
  | { type: "wheel"; x: number; y: number; dx: number; dy: number }
  | { type: "key"; action: "down" | "up"; key: string }
  | { type: "text"; text: string };

const inside = (n: unknown, max: number) => Math.min(Math.max(Number(n) || 0, 0), max - 1);

async function drive(c: Computer, v: Viewer, m: ViewerMessage) {
  if (c.controller !== v) return;
  const { width, height } = COMPUTER_SIZE;
  switch (m.type) {
    case "mouse": {
      c.input.move(inside(m.x, width), inside(m.y, height));
      const button = m.button === "right" || m.button === "middle" ? m.button : "left";
      if (m.action === "move") return;
      c.input.button(button, m.action === "down");
      if (m.action === "down") c.heldButtons.add(button);
      else c.heldButtons.delete(button);
      return;
    }
    case "wheel":
      c.input.move(inside(m.x, width), inside(m.y, height));
      if (Number(m.dy)) c.input.scroll("vertical", Number(m.dy) * WHEEL_PER_PIXEL);
      if (Number(m.dx)) c.input.scroll("horizontal", Number(m.dx) * WHEEL_PER_PIXEL);
      return;
    case "key": {
      const code = keyCode(String(m.key));
      if (code === null) return;
      c.input.key(code, m.action === "down");
      if (m.action === "down") c.heldKeys.add(code);
      else c.heldKeys.delete(code);
      return;
    }
    case "text": {
      const strokes = [...String(m.text).slice(0, 10_000)].map(strokeFor).filter((s): s is Stroke => s !== null);
      return typeStrokes(c, strokes, () => c.controller === v);
    }
  }
}

export function computerViewerMessage(v: Viewer, raw: string) {
  let m: ViewerMessage;
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  if (m.type === "ack") {
    const next = v.pending;
    v.pending = null;
    if (next) v.send(next);
    else v.ready = true;
    return;
  }
  const c = computers.get(v.botId);
  if (m.type === "take" && (!c || (c.controller && c.controller !== v))) return tellControl(v, false);
  if (!c) return;
  if (m.type === "take") {
    c.controller = v;
    c.usedAt = Date.now();
    tellControl(v, true);
    update(v.botId, { controller: "user" });
    return;
  }
  if (m.type === "release") {
    if (c.controller === v) releaseComputer(v.botId);
    return;
  }
  if (c.controller !== v) return;
  c.usedAt = Date.now();
  c.typing = c.typing.then(() => drive(c, v, m)).catch(() => {});
}

setInterval(() => {
  const step = stepAt(new Date());
  for (const c of computers.values()) {
    if (!c.controller && !viewersOf(c.botId).size && Date.now() - c.usedAt > IDLE_MS) void closeComputer(c.botId);
    else if (c.wallpaper && c.wallpaperStep !== step) {
      c.wallpaperStep = step;
      void c.wallpaper.paint(renderWallpaper(COMPUTER_SIZE.width, COMPUTER_SIZE.height, step));
    }
  }
}, 60_000).unref();
