import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bot, MessagePart } from "../shared/types";

const scratch = mkdtempSync(join(tmpdir(), "fabs-mcp-test-"));
process.env.FABS_DATA_DIR = join(scratch, "data");
process.env.FABS_WORK_ROOT = join(scratch, "work");
process.env.FABS_CHROMIUM_SANDBOX ??= "0";
const db = await import("./db");
const screen = await import("./screen");
const computer = await import("./computer");
const { handleMcp } = await import("./mcp");
const { turnsByToken } = await import("./orchestrator");

const bot = (name: string, isTeamLead = false): Bot =>
  db.saveBot({
    id: crypto.randomUUID(),
    name,
    label: "",
    role: "",
    instructions: "",
    shape: "blob",
    color: "#888888",
    provider: "claude",
    model: "claude-haiku-5-5",
    cwd: join(scratch, "work", name),
    autonomy: "full",
    connectorIds: [],
    isTeamLead,
  });

async function call(caller: Bot, name: string, args: Record<string, unknown>, thread = db.createThread("direct", [caller.id])) {
  const parts: MessagePart[] = [];
  const token = crypto.randomUUID();
  turnsByToken.set(token, {
    token,
    turnId: crypto.randomUUID(),
    botId: caller.id,
    threadId: thread.id,
    depth: 0,
    hops: 0,
    signal: new AbortController().signal,
    messageId: "",
    editParts: (edit) => edit(parts),
    addPart: (part) => parts.push(part) - 1,
    updatePart: (i, part) => (parts[i] = part),
  });
  const req = new Request("http://test/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const res = (await (await handleMcp(req, token)).json()) as { result: { isError?: boolean; content: { text: string }[] } };
  turnsByToken.delete(token);
  return { result: res.result, parts };
}

const mockups = bot("Mockups");

test("a start_group without a kickoff is an error with no approval card and no group, even from the lead", async () => {
  for (const caller of [bot("Helper"), bot("Lead", true)]) {
    const groupsBefore = db.listThreads().filter((t) => t.kind === "group").length;
    const { result, parts } = await call(caller, "start_group", { bots: [mockups.name], title: "Launch plan" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Write a kickoff");
    expect(parts.filter((p) => p.type === "approval")).toEqual([]);
    expect(db.listThreads().filter((t) => t.kind === "group").length).toBe(groupsBefore);
  }
});

test("making a bot team lead hands the role over, and the database refuses a second lead", () => {
  const first = bot("First", true);
  const second = bot("Second", true);
  expect(db.listBots().filter((b) => b.isTeamLead).map((b) => b.id)).toEqual([second.id]);
  expect(db.getBot(first.id)!.isTeamLead).toBe(false);
  expect(() => db.db.query("UPDATE bots SET is_team_lead = 1 WHERE id = ?").run(first.id)).toThrow();
});

test("a send_webhook retry with a request id from another group is rejected before anything is sent", async () => {
  const sender = bot("Sender");
  const [first, second] = [0, 1].map(() => db.createThread("group", [sender.id, mockups.id]));
  for (const t of [first!, second!]) db.saveWebhook({ threadId: t.id, url: "http://127.0.0.1:9/unused", secret: "", header: "", encoding: "hex", prefix: "" });
  db.addMessage({ threadId: first!.id, author: "bot", botId: sender.id, parts: [{ type: "webhook", requestId: "fabs-from-first", state: "received", detail: "HTTP 202" }] });
  const { result, parts } = await call(sender, "send_webhook", { task: "Investigate", request_id: "fabs-from-first" }, second!);
  expect(result.isError).toBe(true);
  expect(result.content[0]!.text).toContain("isn't a request id this group sent");
  expect(parts).toEqual([]);
});

test("a webhook send still in flight when the server stops reads as stopped after a restart", () => {
  const sender = bot("Restarted");
  const group = db.createThread("group", [sender.id, mockups.id]);
  const m = db.addMessage({ threadId: group.id, author: "bot", botId: sender.id, status: "streaming", parts: [{ type: "webhook", requestId: "fabs-in-flight", state: "sending", detail: "" }] });
  db.closeDanglingMessages();
  expect(db.getMessage(m.id)!.parts).toEqual([{ type: "webhook", requestId: "fabs-in-flight", state: "failed", detail: "Stopped before the endpoint answered. It may still have arrived" }]);
});

test.skipIf(!screen.findChromium() || computer.computerSupport() !== "ready")(
  "a bot has one of its screen and computer open: the computer closes the screen unless the user has it, and screen_open waits for computer_close",
  async () => {
    const caller = bot("Switcher");
    const page = join(scratch, "page.html");
    writeFileSync(page, "<title>Page</title><h1>Page</h1>");
    expect((await call(caller, "screen_open", { url: `file://${page}` })).result.isError).toBeFalsy();
    const viewer = { botId: caller.id, ready: true, pending: null, send() {} };
    screen.watchScreen(viewer);
    screen.viewerMessage(viewer, JSON.stringify({ type: "take" }));
    expect((await call(caller, "computer_open", { command: "true" })).result.isError).toBe(true);
    expect(screen.isOpen(caller.id)).toBe(true);
    expect(computer.isComputerOpen(caller.id)).toBe(false);
    screen.unwatchScreen(viewer);
    const opened = await call(caller, "computer_open", { command: "true" });
    expect(opened.result.content[0]!.text).toContain("browser screen was closed");
    expect(screen.isOpen(caller.id)).toBe(false);
    expect((await call(caller, "screen_open", { url: `file://${page}` })).result.isError).toBe(true);
    expect(screen.isOpen(caller.id)).toBe(false);
    await computer.closeComputer(caller.id);
  },
  60_000,
);
