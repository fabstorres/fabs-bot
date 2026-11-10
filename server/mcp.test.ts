import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bot, MessagePart } from "../shared/types";

const scratch = mkdtempSync(join(tmpdir(), "fabs-mcp-test-"));
process.env.FABS_DATA_DIR = join(scratch, "data");
process.env.FABS_WORK_ROOT = join(scratch, "work");
const db = await import("./db");
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
