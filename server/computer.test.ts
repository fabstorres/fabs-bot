import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chordCodes, strokesFor } from "./fake-input";
import type { Viewer } from "./screen";

const scratch = mkdtempSync(join(tmpdir(), "fabs-computer-test-"));
process.env.FABS_DATA_DIR = join(scratch, "data");
process.env.FABS_WORK_ROOT = join(scratch, "work");
const computer = await import("./computer");

const SHIFT = 42;
const viewer = (botId: string): Viewer => ({ botId, ready: true, pending: null, send() {} });
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test("symbols and capitals are typed with shift on the US keymap, and line breaks press Enter", () => {
  expect(strokesFor("a?A\r\n")).toEqual([
    { code: 30, shift: false },
    { code: 53, shift: true },
    { code: 30, shift: true },
    { code: 28, shift: false },
  ]);
});

test("text with characters a US keyboard can't type is refused before anything is typed", () => {
  expect(() => strokesFor("ok café ✓")).toThrow(/"é", "✓"/);
});

test("a chord reads + as a key only at the end, and adds shift only for symbols", () => {
  expect(chordCodes("ctrl+shift+T")).toEqual([29, SHIFT, 20]);
  expect(chordCodes("ctrl++")).toEqual([29, SHIFT, 13]);
  expect(chordCodes("ctrl+?")).toEqual([29, SHIFT, 53]);
});

test.skipIf(computer.computerSupport() !== "ready")(
  "the bot can't act while the user has control, leaving the viewer hands it back, and closing ends programs whose launching shell already exited",
  async () => {
    const botId = crypto.randomUUID();
    const v = viewer(botId);
    computer.watchComputer(v);
    const started = await computer.openProgram(botId, "sleep 300 & echo $! > sleep.pid", scratch);
    expect(started.exitCode).toBe(0);
    computer.computerViewerMessage(v, JSON.stringify({ type: "take" }));
    await expect(computer.click(botId, 10, 10, "left", false)).rejects.toMatchObject({ code: "user_has_control" });
    await expect(computer.closeForBot(botId)).rejects.toMatchObject({ code: "user_has_control" });
    computer.unwatchComputer(v);
    expect(new TextDecoder().decode((await computer.screenshot(botId)).subarray(1, 4))).toBe("PNG");
    const sleeper = Number(await Bun.file(join(scratch, "sleep.pid")).text());
    expect(alive(sleeper)).toBe(true);
    const group = readFileSync(`/proc/${sleeper}/stat`, "utf8").split(") ")[1]!.split(" ")[2]!;
    const runtime = readdirSync(process.env.XDG_RUNTIME_DIR!)
      .map((d) => join(process.env.XDG_RUNTIME_DIR!, d, "apps"))
      .find((apps) => existsSync(apps) && readFileSync(apps, "utf8").split("\n").includes(group));
    expect(runtime).toBeDefined();
    await computer.closeComputer(botId);
    expect(alive(sleeper)).toBe(false);
    expect(existsSync(runtime!)).toBe(false);
    expect(existsSync(computer.computerDir(botId))).toBe(true);
  },
  60_000,
);

test.skipIf(computer.computerSupport() !== "ready")(
  "taking control stops the bot partway through typing instead of after it",
  async () => {
    const botId = crypto.randomUUID();
    const v = viewer(botId);
    computer.watchComputer(v);
    await computer.openProgram(botId, "true", scratch);
    const startedAt = Date.now();
    const typing = computer.typeText(botId, "a".repeat(400));
    await Bun.sleep(150);
    computer.computerViewerMessage(v, JSON.stringify({ type: "take" }));
    await expect(typing).rejects.toMatchObject({ code: "user_has_control" });
    expect(Date.now() - startedAt).toBeLessThan(1_500);
    computer.unwatchComputer(v);
    await computer.closeComputer(botId);
  },
  60_000,
);

test.skipIf(computer.computerSupport() !== "ready")(
  "closing a computer while it starts shuts it down once it's up",
  async () => {
    const botId = crypto.randomUUID();
    const opening = computer.openProgram(botId, "true", scratch).catch((e) => e);
    expect(await computer.closeComputer(botId)).toBe(true);
    expect(await opening).toMatchObject({ code: "off" });
    expect(computer.isComputerOn(botId)).toBe(false);
  },
  60_000,
);
