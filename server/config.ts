import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { version } from "../package.json";

const home = homedir();

export const VERSION = version;

export const PORT = Number(process.env.FABS_PORT ?? 4800);
/** HTTPS port `tailscale serve` uses when Tailscale HTTPS is on. 443 is left to other apps. */
export const TAILSCALE_SERVE_PORT = Number(process.env.FABS_TAILSCALE_SERVE_PORT ?? 8443);
export const SERVE_TARGET_PORT = PORT + 1;
/** App state: database, uploaded files, access token. */
export const DATA_DIR = process.env.FABS_DATA_DIR ?? join(home, ".fabs-bot");
/** Where bots work by default. Each bot gets a folder; `shared` is visible to all of them. */
export const WORK_ROOT = process.env.FABS_WORK_ROOT ?? join(home, "FabsBot");
export const SHARED_DIR = join(WORK_ROOT, "shared");
export const FILES_DIR = join(DATA_DIR, "files");
export const WEB_DIST = new URL("../dist/web/", import.meta.url).pathname;

/** How many bot-to-bot hops a single user message may cause in group threads. */
export const MAX_HOPS = 6;

for (const dir of [DATA_DIR, FILES_DIR, WORK_ROOT, SHARED_DIR]) mkdirSync(dir, { recursive: true });

/** Base URL the CLIs use to reach our MCP endpoint. Always loopback: agents run on this machine. */
export const LOCAL_BASE = `http://127.0.0.1:${PORT}`;
