import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bot } from "../shared/types";

const scratch = mkdtempSync(join(tmpdir(), "fabs-orchestrator-test-"));
process.env.FABS_DATA_DIR = join(scratch, "data");
process.env.FABS_WORK_ROOT = join(scratch, "work");
const db = await import("./db");
const { MAX_HOPS } = await import("./config");
const { isBusy, kickoff, stopTurns } = await import("./orchestrator");

const bot = (name: string): Bot =>
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
  });

const chief = bot("Chief");
const design = bot("Design");

function kickoffAt(hops: number) {
  const group = db.createThread("group", [chief.id, design.id], "Launch");
  const started = kickoff(group.id, chief.id, "@Design owns the mockups.", hops);
  const busy = isBusy(group.id, design.id);
  stopTurns(group.id);
  return { group, started, busy };
}

test("a kickoff from deep in a bot chain keeps the chain's hop budget", () => {
  const below = kickoffAt(MAX_HOPS - 1);
  expect(below.started).toEqual([design.id]);
  expect(below.busy).toBe(true);

  const spent = kickoffAt(MAX_HOPS);
  expect(spent.started).toEqual([]);
  expect(spent.busy).toBe(false);
  expect(db.listMessages(spent.group.id).map((m) => m.botId)).toEqual([chief.id]);
});
