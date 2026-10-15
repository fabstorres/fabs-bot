import { app, BrowserWindow, ipcMain, Menu, net, protocol, session, shell, type IpcMainInvokeEvent, type MenuItemConstructorOptions, type WebContents } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { DesktopState, SavedPc } from "../shared/types";

const LOCAL_ORIGIN = `http://127.0.0.1:${Number(process.env.FABS_PORT ?? 4800)}`;
const LAUNCHER_ORIGIN = "fabs-app://launcher";
const WEB_DIST = join(app.getAppPath(), "dist/web");
const PERMISSIONS = ["media", "clipboard-sanitized-write", "notifications", "fullscreen"];

app.setName("Fabs Bot");
app.setPath("userData", process.env.FABS_DESKTOP_DATA ?? join(app.getPath("appData"), "Fabs Bot"));
protocol.registerSchemesAsPrivileged([{ scheme: "fabs-app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const storeFile = () => join(app.getPath("userData"), "pcs.json");

function readStore(): DesktopState {
  try {
    return JSON.parse(readFileSync(storeFile(), "utf8"));
  } catch {
    return { pcs: [], last: null };
  }
}

function writeStore(state: DesktopState) {
  writeFileSync(storeFile(), JSON.stringify(state, null, 2), { mode: 0o600 });
}

let launcher: BrowserWindow | null = null;
let pcWindow: BrowserWindow | null = null;
let pcOrigin: string | null = null;

const within = (url: string, origin: string) => url === origin || url.startsWith(`${origin}/`);

function allowedUrl(contents: WebContents, url: string) {
  if (contents === launcher?.webContents) return within(url, LAUNCHER_ORIGIN);
  return !!pcOrigin && within(url, pcOrigin);
}

function openExternal(url: string) {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url);
}

/** Is Fabs Bot answering at `origin`? 401 still counts: that's a PC this device hasn't paired with yet. */
async function reachable(origin: string) {
  try {
    const res = await net.fetch(`${origin}/api/host`, { signal: AbortSignal.timeout(3000) });
    return res.status === 200 || res.status === 401;
  } catch {
    return false;
  }
}

function showLauncher(error?: string) {
  if (!launcher) {
    launcher = new BrowserWindow({
      width: 520,
      height: 680,
      title: "Fabs Bot",
      backgroundColor: "#ffffff",
      webPreferences: { preload: join(app.getAppPath(), "dist/desktop/preload.cjs"), sandbox: true, contextIsolation: true },
    });
    launcher.on("closed", () => (launcher = null));
  }
  void launcher.loadURL(`${LAUNCHER_ORIGIN}/desktop.html${error ? `?error=${encodeURIComponent(error)}` : ""}`);
  launcher.focus();
  pcWindow?.destroy();
  pcWindow = null;
  pcOrigin = null;
}

async function openPc(id: string, url?: string): Promise<string | null> {
  const store = readStore();
  const origin = id === "local" ? LOCAL_ORIGIN : store.pcs.find((pc) => pc.id === id)?.origin;
  if (!origin) return "That PC isn't saved anymore.";
  if (!(await reachable(origin))) {
    return id === "local"
      ? "Fabs Bot isn't running on this PC. Start it with `bun run start`, then try again."
      : "Couldn't reach that PC. Check that it's on, running Fabs Bot, and on your tailnet.";
  }
  writeStore({ ...store, last: id });

  pcWindow?.destroy();
  pcOrigin = origin;
  pcWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Fabs Bot",
    backgroundColor: "#ffffff",
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  const opened = pcWindow;
  opened.on("closed", () => {
    if (pcWindow === opened) {
      pcWindow = null;
      pcOrigin = null;
    }
  });
  opened.webContents.on("did-finish-load", () => void session.defaultSession.cookies.flushStore());
  opened.webContents.on("did-fail-load", (_e, code, _desc, _url, isMainFrame) => {
    if (isMainFrame && code !== -3 && pcWindow === opened) showLauncher("That PC stopped answering.");
  });
  void opened.loadURL(url ?? `${origin}/`);
  launcher?.close();
  return null;
}

async function addPc(link: string, name: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return "Paste the pairing link from the other PC, or its address.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "Only http and https links work here.";
  if (!(await reachable(url.origin))) return "Couldn't reach that PC. Check that it's on, running Fabs Bot, and on your tailnet.";
  const store = readStore();
  const existing = store.pcs.find((pc) => pc.origin === url.origin);
  const pc: SavedPc = { id: existing?.id ?? randomUUID(), name: name.trim() || existing?.name || url.hostname.split(".")[0]!, origin: url.origin };
  writeStore({ ...store, pcs: [...store.pcs.filter((p) => p.id !== pc.id), pc] });
  return openPc(pc.id, url.pathname === "/pair" ? url.href : undefined);
}

async function removePc(id: string) {
  const store = readStore();
  const pc = store.pcs.find((p) => p.id === id);
  writeStore({ pcs: store.pcs.filter((p) => p.id !== id), last: store.last === id ? null : store.last });
  if (pc) await session.defaultSession.clearStorageData({ origin: pc.origin });
}

/** Only the launcher page, in its own window and main frame, may use the desktop bridge. */
function fromLauncher(e: IpcMainInvokeEvent) {
  const frame = e.senderFrame;
  return !!launcher && !!frame && e.sender === launcher.webContents && frame === e.sender.mainFrame && within(frame.url, LAUNCHER_ORIGIN);
}

function handle(channel: string, fn: (...args: unknown[]) => unknown) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!fromLauncher(e)) throw new Error("forbidden");
    return fn(...args);
  });
}

handle("pcs:state", () => readStore());
handle("pcs:open", (id) => openPc(String(id)));
handle("pcs:add", (link, name) => addPc(String(link), String(name ?? "")));
handle("pcs:remove", (id) => removePc(String(id)));

app.on("web-contents-created", (_e, contents) => {
  contents.on("will-navigate", (e, url) => {
    if (allowedUrl(contents, url)) return;
    e.preventDefault();
    openExternal(url);
  });
  contents.on("will-redirect", (e, url) => {
    if (!allowedUrl(contents, url)) e.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
});

function setMenu() {
  const mac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [
    ...(mac ? [{ role: "appMenu" } as const] : []),
    {
      label: "File",
      submenu: [{ label: "Switch PC…", accelerator: "CmdOrCtrl+Shift+O", click: () => showLauncher() }, { type: "separator" }, mac ? { role: "close" } : { role: "quit" }],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();

app.on("second-instance", () => {
  const win = pcWindow ?? launcher;
  if (win?.isMinimized()) win.restore();
  win?.focus();
});

app.on("window-all-closed", () => app.quit());

app.whenReady().then(async () => {
  if (!primary) return;
  protocol.handle("fabs-app", (req) => {
    const url = new URL(req.url);
    const file = resolve(WEB_DIST, `.${decodeURIComponent(url.pathname)}`);
    if (url.host !== "launcher" || !file.startsWith(WEB_DIST + sep) || !existsSync(file)) return new Response("not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  const allowPermission = (contents: WebContents | null, permission: string, url: string) =>
    !!contents && contents !== launcher?.webContents && !!pcOrigin && within(url, pcOrigin) && PERMISSIONS.includes(permission);
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(allowPermission(contents, permission, details.requestingUrl) && !("mediaTypes" in details && details.mediaTypes?.includes("video"))),
  );
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, origin, details) => allowPermission(contents, permission, origin) && details.mediaType !== "video",
  );
  setMenu();

  const { last } = readStore();
  const error = last ? await openPc(last) : null;
  if (!last || error) showLauncher(error ?? undefined);
});
