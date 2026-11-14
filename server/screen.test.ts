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

const form = join(scratch, "form.html");
writeFileSync(
  form,
  `<title>Form</title>
  <input id="cover" type="file" accept=".pdf,.txt" style="position:fixed;left:0;top:0;width:300px;height:60px">
  <button style="position:fixed;left:0;top:100px" onclick="document.getElementById('resume').click()">Upload resume</button>
  <input id="resume" type="file" hidden>
  <script>for (const i of document.querySelectorAll("input")) i.onchange = () => (document.title = i.id + ":" + [...i.files].map((f) => f.name));</script>`,
);
const cv = join(scratch, "cv.pdf");
writeFileSync(cv, "%PDF-1.4");
const old = join(scratch, "old.pdf");
writeFileSync(old, "%PDF-1.4");
const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await Bun.sleep(50);
};

test.skipIf(!screen.findChromium())(
  "a file picker opened while the user has control goes only to the controlling viewer, and a reply meant for an earlier picker can't fill a newer one",
  async () => {
    const { addFile } = await import("./db");
    const botId = crypto.randomUUID();
    const sent: string[] = [];
    const controller: Viewer = { ...viewer(botId), send: (d) => typeof d === "string" && sent.push(d) };
    const watcher: string[] = [];
    screen.watchScreen(controller);
    screen.watchScreen({ ...viewer(botId), send: (d) => typeof d === "string" && watcher.push(d) });
    await screen.openPage(botId, `file://${form}`);
    screen.viewerMessage(controller, JSON.stringify({ type: "take" }));
    const offers = () => sent.map((m) => JSON.parse(m)).filter((m) => m.type === "chooser" && m.chooser);
    for (const count of [1, 2]) {
      for (const action of ["down", "up"]) screen.viewerMessage(controller, JSON.stringify({ type: "mouse", action, x: 20, y: 20 }));
      await until(() => offers().length === count);
    }
    const [earlier, newer] = offers().map((m) => m.chooser);
    expect(newer).toMatchObject({ accept: ".pdf,.txt", multiple: false });
    expect(watcher.some((m) => m.includes("chooser"))).toBe(false);
    const stale = addFile({ thread_id: null, bot_id: null, path: old, name: "old.pdf", size: 8 });
    const file = addFile({ thread_id: null, bot_id: null, path: cv, name: "cv.pdf", size: 8 });
    screen.viewerMessage(controller, JSON.stringify({ type: "choose", id: earlier.id, fileIds: [stale.id] }));
    screen.viewerMessage(controller, JSON.stringify({ type: "choose", id: newer.id, fileIds: [file.id] }));
    await until(() => sent.some((m) => m.includes('"chooser":null')));
    screen.viewerMessage(controller, JSON.stringify({ type: "release" }));
    const page = await screen.readPage(botId, false);
    expect(page.title).toBe("cover:cv.pdf");
    expect(page.picker).toBe(false);
    await screen.closeScreen(botId);
  },
  60_000,
);

test.skipIf(!screen.findChromium())(
  "a single-file picker that survives a hash change refuses two files, and the bot can then fill it without a ref",
  async () => {
    const botId = crypto.randomUUID();
    await screen.openPage(botId, `file://${form}`);
    const ref = refOf((await screen.readPage(botId, false)).tree, "Upload resume");
    await expect(screen.upload(botId, [cv, page], { ref })).rejects.toMatchObject({ code: "one_file" });
    await screen.openPage(botId, `file://${form}#step2`);
    expect((await screen.readPage(botId, false)).picker).toBe(true);
    await screen.upload(botId, [cv], {});
    expect((await screen.readPage(botId, false)).title).toBe("resume:cv.pdf");
    await screen.closeScreen(botId);
  },
  60_000,
);
