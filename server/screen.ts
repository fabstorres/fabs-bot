import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { chromium, type BrowserContext, type CDPSession, type Locator, type Page } from "playwright-core";
import type { ScreenState } from "../shared/types";
import { publish } from "./bus";
import { DATA_DIR } from "./config";

export const VIEWPORT = { width: 1280, height: 800 };
const ACTION_TIMEOUT_MS = 15_000;
const LOAD_TIMEOUT_MS = 30_000;
const IDLE_MS = 30 * 60_000;
const READ_CAP = 20_000;
const FRAME_QUALITY = 70;

export class ScreenError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const fail = (code: string, message: string): never => {
  throw new ScreenError(code, message);
};

const LINUX_BROWSERS = ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"];
const MAC_BROWSERS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
];
const PLAYWRIGHT_EXES = [
  "chrome-headless-shell",
  "chrome",
  "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "Chromium.app/Contents/MacOS/Chromium",
];

function playwrightBrowsers(): string[] {
  const root = platform() === "darwin" ? join(homedir(), "Library/Caches/ms-playwright") : join(homedir(), ".cache/ms-playwright");
  if (!existsSync(root)) return [];
  const build = (dir: string) => Number(dir.split("-").pop());
  return readdirSync(root)
    .filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d))
    .sort((a, b) => build(b) - build(a))
    .flatMap((d) => readdirSync(join(root, d)).flatMap((sub) => PLAYWRIGHT_EXES.map((exe) => join(root, d, sub, exe))));
}

export function findChromium(): string | null {
  const override = process.env.FABS_CHROMIUM;
  if (override) return existsSync(override) ? override : null;
  const system = platform() === "darwin" ? MAC_BROWSERS : LINUX_BROWSERS.map((b) => Bun.which(b) ?? "");
  return [...system, ...playwrightBrowsers()].find((p) => p && existsSync(p)) ?? null;
}

const UA_PLATFORM = platform() === "darwin" ? "Macintosh; Intel Mac OS X 10_15_7" : "X11; Linux x86_64";

function userAgent(exe: string): string | undefined {
  try {
    const major = execFileSync(exe, ["--version"], { encoding: "utf8", timeout: 5_000 }).match(/(\d+)\.\d+\.\d+/)?.[1];
    return major ? `Mozilla/5.0 (${UA_PLATFORM}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36` : undefined;
  } catch {
    return undefined;
  }
}

const LOCAL_HOST = /^(localhost|127(\.\d+){3}|0\.0\.0\.0|\[::1\])(:\d+)?([/?#]|$)/i;
const HOST_PORT = /^[\w.-]+:\d+([/?#]|$)/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function normalizeUrl(raw: string): string {
  const text = raw.trim();
  if (!text) return fail("bad_url", "Pass the address of the page to open.");
  const full = LOCAL_HOST.test(text) ? `http://${text}` : HOST_PORT.test(text) || !HAS_SCHEME.test(text) ? `https://${text}` : text;
  let url: URL;
  try {
    url = new URL(full);
  } catch {
    return fail("bad_url", `"${text}" isn't a web address.`);
  }
  if (url.protocol === "javascript:") return fail("bad_url", "javascript: links don't open a page. Use the screen tools to act on the page.");
  return url.href;
}

export const profileDir = (botId: string) => join(DATA_DIR, "screens", botId);

export type Viewer = {
  botId: string;
  send(data: string | Uint8Array): void;
  ready: boolean;
  pending: Uint8Array | null;
};

type Screen = {
  botId: string;
  context: BrowserContext;
  page: Page;
  cdp: CDPSession | null;
  queue: Promise<unknown>;
  input: Promise<unknown>;
  controller: Viewer | null;
  usedAt: number;
};

const screens = new Map<string, Screen>();
const launching = new Map<string, Promise<Screen>>();
const states = new Map<string, ScreenState>();
const viewers = new Map<string, Set<Viewer>>();
const lastFrames = new Map<string, Uint8Array>();

const viewersOf = (botId: string) => viewers.get(botId) ?? new Set<Viewer>();

export function screenState(botId: string): ScreenState {
  return states.get(botId) ?? { botId, status: "closed", url: "", title: "", controller: "bot", activeAt: 0, updatedAt: 0 };
}

export const listScreens = () => [...states.values()];
export const isOpen = (botId: string) => screens.has(botId);

function update(botId: string, patch: Partial<Omit<ScreenState, "botId">>) {
  const next: ScreenState = { ...screenState(botId), ...patch, botId, updatedAt: Date.now() };
  states.set(botId, next);
  publish({ type: "screen", screen: next });
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

async function startCast(s: Screen) {
  if (s.cdp || !viewersOf(s.botId).size || screens.get(s.botId) !== s) return;
  const page = s.page;
  const cdp = await s.context.newCDPSession(page).catch(() => null);
  if (!cdp) return;
  if (s.cdp || s.page !== page || !viewersOf(s.botId).size) return void cdp.detach().catch(() => {});
  s.cdp = cdp;
  cdp.on("Page.screencastFrame", (f) => {
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    if (s.cdp === cdp) deliver(s.botId, Buffer.from(f.data, "base64"));
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: FRAME_QUALITY, maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height }).catch(() => {});
  const still = await page.screenshot({ type: "jpeg", quality: FRAME_QUALITY }).catch(() => null);
  if (still && s.cdp === cdp) deliver(s.botId, still);
}

async function stopCast(s: Screen) {
  const cdp = s.cdp;
  s.cdp = null;
  if (!cdp) return;
  await cdp.send("Page.stopScreencast").catch(() => {});
  await cdp.detach().catch(() => {});
}

async function title(page: Page) {
  return page.title().catch(() => "");
}

function follow(s: Screen, page: Page) {
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() && s.page === page) update(s.botId, { url: page.url() });
  });
  page.on("load", async () => {
    if (s.page === page) update(s.botId, { status: "live", url: page.url(), title: await title(page) });
  });
  page.on("close", () => {
    const next = s.context.pages().at(-1);
    if (s.page === page && next) void show(s, next);
  });
}

async function show(s: Screen, page: Page) {
  s.page = page;
  await stopCast(s);
  void startCast(s);
  update(s.botId, { url: page.url(), title: await title(page) });
}

async function launch(botId: string): Promise<Screen> {
  const exe = findChromium();
  if (!exe) return fail("no_browser", "No Chromium browser found on this PC. Ask the user to install Google Chrome or Chromium.");
  const dir = profileDir(botId);
  mkdirSync(dir, { recursive: true });
  const context = await chromium
    .launchPersistentContext(dir, {
      executablePath: exe,
      headless: true,
      chromiumSandbox: process.env.FABS_CHROMIUM_SANDBOX !== "0",
      viewport: VIEWPORT,
      userAgent: userAgent(exe),
    })
    .catch((e: Error) => fail("launch_failed", `Your screen's browser didn't start: ${firstLine(e)}`));
  context.setDefaultTimeout(ACTION_TIMEOUT_MS);
  const page = context.pages()[0] ?? (await context.newPage());
  const s: Screen = { botId, context, page, cdp: null, queue: Promise.resolve(), input: Promise.resolve(), controller: null, usedAt: Date.now() };
  screens.set(botId, s);
  follow(s, page);
  context.on("page", (p) => {
    follow(s, p);
    void show(s, p);
  });
  context.on("close", () => {
    if (screens.get(botId) !== s) return;
    screens.delete(botId);
    update(botId, { status: "closed", url: "", title: "", controller: "bot" });
  });
  void startCast(s);
  return s;
}

async function ensure(botId: string): Promise<Screen> {
  const open = screens.get(botId);
  if (open) return open;
  const pending = launching.get(botId) ?? launch(botId).finally(() => launching.delete(botId));
  launching.set(botId, pending);
  return pending;
}

const firstLine = (e: unknown) => String((e as Error)?.message ?? e).split("\n")[0]!.replace(/^\w+Error: /, "");

const USER_HAS_CONTROL = "The user has control of your screen right now. Wait until they hand it back, or ask in chat.";

async function asBot<T>(botId: string, act: (s: Screen) => Promise<T>, opts: { launch?: boolean } = {}): Promise<T> {
  const s = opts.launch ? await ensure(botId) : screens.get(botId);
  if (!s) return fail("not_open", "Your screen has nothing open. Call screen_open first.");
  const run = s.queue.then(async () => {
    if (s.controller) return fail("user_has_control", USER_HAS_CONTROL);
    s.usedAt = Date.now();
    update(botId, { activeAt: Date.now() });
    try {
      return await act(s);
    } catch (e) {
      if (e instanceof ScreenError) throw e;
      return fail("action_failed", firstLine(e));
    }
  });
  s.queue = run.catch(() => {});
  return run;
}

async function target(page: Page, t: { ref?: string; selector?: string }): Promise<Locator> {
  if (t.ref) {
    const loc = page.locator(`aria-ref=${t.ref.replace(/^\[?ref=/, "").replace(/\]$/, "")}`);
    if ((await loc.count().catch(() => 0)) === 0) return fail("stale_ref", `No element ${t.ref} on the page now. Refs change when the page changes; call screen_read again.`);
    return loc;
  }
  if (t.selector) return page.locator(t.selector).first();
  return fail("no_target", "Pass ref (from screen_read) or selector.");
}

async function pointAt(s: Screen, loc: Locator) {
  const box = await loc.boundingBox().catch(() => null);
  if (box) broadcast(s.botId, { type: "pointer", x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

export function openPage(botId: string, raw: string) {
  const url = normalizeUrl(raw);
  return asBot(
    botId,
    async (s) => {
      update(botId, { status: "loading", url });
      const res = await s.page.goto(url, { waitUntil: "domcontentloaded", timeout: LOAD_TIMEOUT_MS }).catch((e) => {
        update(botId, { status: "live", url: s.page.url() });
        return fail("load_failed", `Couldn't load ${url}: ${firstLine(e)}`);
      });
      const t = await title(s.page);
      update(botId, { status: "live", url: s.page.url(), title: t });
      return { url: s.page.url(), title: t, status: res?.status() ?? 0 };
    },
    { launch: true },
  );
}

export function readPage(botId: string, withImage: boolean) {
  return asBot(botId, async (s) => {
    const tree = await s.page.ariaSnapshot({ mode: "ai", timeout: ACTION_TIMEOUT_MS });
    const image = withImage ? new Uint8Array(await s.page.screenshot({ type: "jpeg", quality: 60 })) : undefined;
    const clipped = tree.length > READ_CAP ? `${tree.slice(0, READ_CAP)}\n[truncated, ${tree.length - READ_CAP} more chars; scroll and read again]` : tree;
    return { url: s.page.url(), title: await title(s.page), tree: clipped, image };
  });
}

export function click(botId: string, t: { ref?: string; selector?: string }, double = false) {
  return asBot(botId, async (s) => {
    const loc = await target(s.page, t);
    await pointAt(s, loc);
    await loc.click({ clickCount: double ? 2 : 1 });
    return s.page.url();
  });
}

export function typeText(botId: string, text: string, t: { ref?: string; selector?: string }, submit = false) {
  return asBot(botId, async (s) => {
    if (t.ref || t.selector) {
      const loc = await target(s.page, t);
      await pointAt(s, loc);
      await loc.fill(text);
    } else {
      await s.page.keyboard.insertText(text);
    }
    if (submit) await s.page.keyboard.press("Enter");
    return s.page.url();
  });
}

export function pressKey(botId: string, key: string) {
  return asBot(botId, async (s) => {
    await s.page.keyboard.press(key);
    return s.page.url();
  });
}

export function scroll(botId: string, direction: "up" | "down", amount: number) {
  return asBot(botId, async (s) => {
    await s.page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    await s.page.mouse.wheel(0, direction === "up" ? -amount : amount);
    return s.page.url();
  });
}

export function waitFor(botId: string, opts: { text?: string; url?: string; timeoutMs: number }) {
  if (!opts.text && !opts.url) return fail("no_condition", "Pass text, url, or both.");
  return asBot(botId, async (s) => {
    const timeout = opts.timeoutMs;
    const waits: Promise<unknown>[] = [];
    if (opts.text) waits.push(s.page.getByText(opts.text).first().waitFor({ timeout }));
    if (opts.url) waits.push(s.page.waitForURL((u) => u.href.includes(opts.url!), { timeout }));
    await Promise.all(waits).catch((e) => fail("timeout", `Still waiting after ${timeout / 1000}s: ${firstLine(e)}`));
    return s.page.url();
  });
}

export async function closeScreen(botId: string) {
  const s = screens.get(botId);
  if (!s) return false;
  await stopCast(s);
  await s.context.close().catch(() => {});
  return true;
}

export function closeForBot(botId: string) {
  if (!screens.has(botId)) return Promise.resolve(false);
  return asBot(botId, async () => closeScreen(botId));
}

export async function forgetScreen(botId: string) {
  await closeScreen(botId);
  states.delete(botId);
  lastFrames.delete(botId);
  rmSync(profileDir(botId), { recursive: true, force: true });
}

export async function closeAllScreens() {
  await Promise.all([...screens.keys()].map(closeScreen));
}

export function releaseScreen(botId: string) {
  const s = screens.get(botId);
  if (!s?.controller) return;
  s.controller = null;
  update(botId, { controller: "bot" });
}

export function watchScreen(v: Viewer) {
  viewers.set(v.botId, viewersOf(v.botId).add(v));
  v.send(JSON.stringify({ type: "hello", width: VIEWPORT.width, height: VIEWPORT.height }));
  const s = screens.get(v.botId);
  const last = lastFrames.get(v.botId);
  if (s && last) push(v, last);
  if (s) void startCast(s);
}

export function unwatchScreen(v: Viewer) {
  const set = viewersOf(v.botId);
  set.delete(v);
  const s = screens.get(v.botId);
  if (s?.controller === v) releaseScreen(v.botId);
  if (s && !set.size) void stopCast(s);
}

type ViewerMessage =
  | { type: "ack" }
  | { type: "take" }
  | { type: "release" }
  | { type: "mouse"; action: "down" | "up" | "move"; x: number; y: number; button?: "left" | "right" | "middle" }
  | { type: "wheel"; x: number; y: number; dx: number; dy: number }
  | { type: "key"; action: "down" | "up"; key: string }
  | { type: "text"; text: string };

const inside = (n: unknown, max: number) => Math.min(Math.max(Number(n) || 0, 0), max);

async function drive(s: Screen, m: ViewerMessage) {
  const { mouse, keyboard } = s.page;
  switch (m.type) {
    case "mouse": {
      const x = inside(m.x, VIEWPORT.width);
      const y = inside(m.y, VIEWPORT.height);
      const button = m.button === "right" || m.button === "middle" ? m.button : "left";
      await mouse.move(x, y);
      if (m.action === "down") await mouse.down({ button });
      if (m.action === "up") await mouse.up({ button });
      return;
    }
    case "wheel":
      await mouse.move(inside(m.x, VIEWPORT.width), inside(m.y, VIEWPORT.height));
      return mouse.wheel(Number(m.dx) || 0, Number(m.dy) || 0);
    case "key":
      return m.action === "down" ? keyboard.down(String(m.key)) : keyboard.up(String(m.key));
    case "text":
      return keyboard.insertText(String(m.text).slice(0, 10_000));
  }
}

export function viewerMessage(v: Viewer, raw: string) {
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
  const s = screens.get(v.botId);
  if (!s) return;
  if (m.type === "take") {
    if (s.controller && s.controller !== v) return;
    s.controller = v;
    s.usedAt = Date.now();
    update(v.botId, { controller: "user" });
    return;
  }
  if (m.type === "release") {
    if (s.controller === v) releaseScreen(v.botId);
    return;
  }
  if (s.controller !== v) return;
  s.usedAt = Date.now();
  s.input = s.input.then(() => drive(s, m)).catch(() => {});
}

setInterval(() => {
  for (const s of screens.values()) {
    if (!s.controller && !viewersOf(s.botId).size && Date.now() - s.usedAt > IDLE_MS) void closeScreen(s.botId);
  }
}, 60_000).unref();
