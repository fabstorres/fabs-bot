import { expect, setSystemTime, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MessagePart } from "../shared/types";
import type { TurnContext } from "./orchestrator";

const scratch = mkdtempSync(join(tmpdir(), "fabs-events-test-"));
process.env.FABS_DATA_DIR = join(scratch, "data");
process.env.FABS_WORK_ROOT = join(scratch, "work");
const db = await import("./db");
const { decideApproval, handleMcp } = await import("./mcp");
const { turnsByToken } = await import("./orchestrator");

const bot = db.saveBot({
  id: crypto.randomUUID(),
  name: "Chief",
  label: "",
  role: "",
  instructions: "",
  shape: "blob",
  color: "#888888",
  provider: "claude",
  model: "claude-haiku-5-5",
  cwd: join(scratch, "work", "chief"),
  autonomy: "ask",
  connectorIds: [],
  isTeamLead: false,
});

function turn(threadId: string) {
  const parts: MessagePart[] = [];
  const ctrl = new AbortController();
  const ctx: TurnContext = {
    token: crypto.randomUUID(),
    turnId: crypto.randomUUID(),
    botId: bot.id,
    threadId,
    depth: 0,
    hops: 0,
    signal: ctrl.signal,
    messageId: "",
    editParts: (edit) => edit(parts),
    addPart: (part) => parts.push(part) - 1,
    updatePart: (i, part) => (parts[i] = part),
  };
  turnsByToken.set(ctx.token, ctx);
  const call = (name: string, args: unknown) =>
    handleMcp(
      new Request("http://127.0.0.1/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
      }),
      ctx.token,
    );
  const approvalId = async () => {
    for (;;) {
      const part = parts.find((p) => p.type === "approval");
      if (part?.type === "approval") return part.requestId;
      await Bun.sleep(1);
    }
  };
  return { ctx, ctrl, call, approvalId };
}

const outcomes = (threadId: string, type: string) =>
  db.listEvents(threadId, 0, 500).filter((e: any) => e.type === type).map((e: any) => e.outcome);

test("a deleted thread's trail stays readable after the thread is gone", () => {
  const t = db.createThread("group", [bot.id], "Gone", { actor: "api" });
  db.deleteThread(t.id, { actor: "api" });
  expect(db.getThread(t.id)).toBeNull();
  expect(db.listEvents(t.id, 0, 500).map((e: any) => [e.type, e.threadKind, e.actor])).toEqual([
    ["thread.create", "group", "api"],
    ["thread.delete", "group", "api"],
  ]);
});

test("events are kept for exactly 30 days, on read and on prune", () => {
  const start = Date.now();
  setSystemTime(start);
  const t = db.createThread("direct", [bot.id]);
  setSystemTime(start + db.EVENT_RETENTION_MS);
  expect(db.listEvents(t.id, 0, 500)).toHaveLength(1);
  db.pruneEvents();
  expect(db.listEvents(t.id, 0, 500)).toHaveLength(1);
  setSystemTime(start + db.EVENT_RETENTION_MS + 1);
  expect(db.listEvents(t.id, 0, 500)).toHaveLength(0);
  db.pruneEvents();
  setSystemTime();
  expect(db.listEvents(t.id, 0, 500)).toHaveLength(0);
});

test("pruning never lets a new event reuse an id a saved cursor has already seen", () => {
  const start = Date.now();
  setSystemTime(start);
  const t = db.createThread("direct", [bot.id]);
  const [created] = db.listEvents(t.id, 0, 500);
  setSystemTime(start + db.EVENT_RETENTION_MS + 1);
  db.pruneEvents();
  db.deleteThread(t.id);
  setSystemTime();
  expect(db.listEvents(t.id, created!.id, 500)).toHaveLength(1);
});

test("a denied approval and a cancelled one are recorded differently", async () => {
  const t = db.createThread("direct", [bot.id]);
  const denied = turn(t.id);
  const deniedCall = denied.call("approve", { tool_name: "Bash", input: { command: "ls" } });
  decideApproval(await denied.approvalId(), "deny");
  await deniedCall;
  const cancelled = turn(t.id);
  const cancelledCall = cancelled.call("approve", { tool_name: "Bash", input: { command: "ls" } });
  await cancelled.approvalId();
  cancelled.ctrl.abort();
  await cancelledCall;
  expect(outcomes(t.id, "approval.decision")).toEqual(["denied", "cancelled"]);
});

test("unknown tool names and exception text never reach the events table", async () => {
  const t = db.createThread("direct", [bot.id]);
  const { call } = turn(t.id);
  await call("SECRET_MARKER_TOOL", {});
  await call("read_thread", { thread_id: "SECRET_MARKER_ARG" });
  expect(outcomes(t.id, "tool.result")).toEqual(["rejected", "rejected"]);
  expect(JSON.stringify(db.db.query("SELECT * FROM events").all())).not.toContain("SECRET_MARKER");
});
