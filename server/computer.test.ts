import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
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
  "the bot can't act while the user has control, leaving the viewer hands it back, and closing ends every program it started",
  async () => {
    const botId = crypto.randomUUID();
    const v = viewer(botId);
    computer.watchComputer(v);
    const started = await computer.openProgram(botId, "sleep 300 & echo $! > sleep.pid; wait", scratch);
    expect(started.exitCode).toBeNull();
    computer.computerViewerMessage(v, JSON.stringify({ type: "take" }));
    await expect(computer.click(botId, 10, 10, "left", false)).rejects.toMatchObject({ code: "user_has_control" });
    await expect(computer.closeForBot(botId)).rejects.toMatchObject({ code: "user_has_control" });
    computer.unwatchComputer(v);
    expect(new TextDecoder().decode((await computer.screenshot(botId)).subarray(1, 4))).toBe("PNG");
    const sleeper = Number(await Bun.file(join(scratch, "sleep.pid")).text());
    expect(alive(sleeper)).toBe(true);
    const runtimes = () => readdirSync(process.env.XDG_RUNTIME_DIR!).filter((d) => d.startsWith("fabs-computer-")).length;
    const before = runtimes();
    await computer.closeComputer(botId);
    expect(alive(sleeper)).toBe(false);
    expect(runtimes()).toBe(before - 1);
    expect(existsSync(computer.computerDir(botId))).toBe(true);
  },
  60_000,
);
