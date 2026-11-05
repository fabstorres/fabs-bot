import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Viewer } from "./screen";

const scratch = mkdtempSync(join(tmpdir(), "fabs-screen-test-"));
process.env.FABS_DATA_DIR = join(scratch, "data");
process.env.FABS_WORK_ROOT = join(scratch, "work");
process.env.FABS_CHROMIUM_SANDBOX ??= "0";
const screen = await import("./screen");

const page = join(scratch, "page.html");
writeFileSync(page, `<title>Launch</title><button onclick="document.title='clicked'">Go</button>`);
const viewer = (botId: string): Viewer => ({ botId, ready: true, pending: null, send() {} });
const refOf = (tree: string, name: string) => tree.match(new RegExp(`"${name}" \\[ref=(e\\d+)\\]`))![1]!;

test("a host with a port is an address, not a URL scheme", () => {
  expect(screen.normalizeUrl("localhost:5173/app")).toBe("http://localhost:5173/app");
  expect(screen.normalizeUrl("staging.example.com:8080")).toBe("https://staging.example.com:8080/");
  expect(() => screen.normalizeUrl("javascript:alert(1)")).toThrow();
});

test.skipIf(!screen.findChromium())(
  "the bot can neither act nor close its screen while the user has control, and leaving the viewer hands it back",
  async () => {
    const botId = crypto.randomUUID();
    const v = viewer(botId);
    screen.watchScreen(v);
    await screen.openPage(botId, `file://${page}`);
    const ref = refOf((await screen.readPage(botId, false)).tree, "Go");
    screen.viewerMessage(v, JSON.stringify({ type: "take" }));
    await expect(screen.click(botId, { ref })).rejects.toMatchObject({ code: "user_has_control" });
    await expect(screen.closeForBot(botId)).rejects.toMatchObject({ code: "user_has_control" });
    screen.unwatchScreen(v);
    await screen.click(botId, { ref });
    expect((await screen.readPage(botId, false)).title).toBe("clicked");
    await screen.closeScreen(botId);
  },
  60_000,
);

test.skipIf(!screen.findChromium())(
  "a ref read before the page changed is refused instead of clicking something else",
  async () => {
    const botId = crypto.randomUUID();
    await screen.openPage(botId, `file://${page}`);
    const ref = refOf((await screen.readPage(botId, false)).tree, "Go");
    await screen.openPage(botId, `file://${page}?again`);
    await expect(screen.click(botId, { ref })).rejects.toMatchObject({ code: "stale_ref" });
    await screen.closeScreen(botId);
  },
  60_000,
);
