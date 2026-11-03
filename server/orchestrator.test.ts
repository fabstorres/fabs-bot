import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linkHandles } from "../shared/mentions";
import type { Bot, ServerEvent } from "../shared/types";

const scratch = mkdtempSync(join(tmpdir(), "fabs-orchestrator-test-"));
process.env.FABS_DATA_DIR = join(scratch, "data");
process.env.FABS_WORK_ROOT = join(scratch, "work");
const db = await import("./db");
const { MAX_HOPS } = await import("./config");
const { isBusy, kickoff, postUserMessage, stopTurns, systemPrompt } = await import("./orchestrator");
const { providers } = await import("./providers");
const { subscribe } = await import("./bus");

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

function kickoffAt(hops: number, linked = linkHandles("@Design owns the mockups.", db.listBots())) {
  const group = db.createThread("group", [chief.id, design.id], "Launch");
  const started = kickoff(group.id, chief.id, linked, hops);
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

test("a kickoff linked before approval still starts a teammate renamed while it waited", () => {
  const linked = linkHandles("@Design owns the mockups.", db.listBots());
  db.saveBot({ ...design, name: "Studio" });
  try {
    expect(kickoffAt(0, linked).started).toEqual([design.id]);
  } finally {
    db.saveBot(design);
  }
});

test("the chat scope rules sit alongside the group hand-off and backchannel instructions", () => {
  const group = systemPrompt(chief, db.createThread("group", [chief.id, design.id], "Launch"));
  expect(group).toContain('This chat: group chat "Launch"');
  expect(group).toContain("Write a teammate's handle to hand them the floor");
  expect(group).toContain("start_group");

  const backchannel = systemPrompt(chief, db.createThread("backchannel", [chief.id, design.id]));
  expect(backchannel).toContain("This chat owns its context.");
  expect(backchannel).toContain("This is a private channel between you and another bot.");
});

const replies = new Map<string, string[]>();
providers.claude.run = async ({ bot }, emit) => {
  emit({ type: "session", id: crypto.randomUUID() });
  for (const chunk of replies.get(bot.name) ?? []) {
    emit({ type: "text", text: chunk });
    await Bun.sleep(200);
  }
};

async function until(done: () => boolean) {
  for (let i = 0; i < 300 && !done(); i++) await Bun.sleep(10);
}

test("when every group bot passes, no partial pass is shown and the user sees nobody took it", async () => {
  const writer = bot("Writer");
  replies.set("Design", ["[pa", "ss]"]).set("Writer", ["[PASS]"]);
  const group = db.createThread("group", [design.id, writer.id], "Quiet");
  const shown: string[] = [];
  const stop = subscribe((e: ServerEvent) => {
    if (e.type === "message" && e.message.author === "bot") shown.push(JSON.stringify(e.message.parts));
  });
  await postUserMessage(group.id, [{ type: "text", text: "what's the weather?" }]);
  await until(() => db.listMessages(group.id).some((m) => m.author === "system"));
  stop();

  expect(shown.filter((parts) => parts.includes("pa"))).toEqual([]);
  expect(db.listMessages(group.id).map((m) => m.author)).toEqual(["user", "system"]);
  expect(db.getThread(group.id)?.unread).toBe(1);
});

test("a bot handed the floor in a no-mention turn can't pass", async () => {
  const engineer = bot("Engineer");
  replies.set("Engineer", ["Fixed. @Design over to you."]).set("Design", ["[pass]"]);
  const group = db.createThread("group", [engineer.id, design.id], "Handoff");
  await postUserMessage(group.id, [{ type: "text", text: "fix the login bug" }]);
  await until(() => db.listMessages(group.id).filter((m) => m.author === "bot" && m.status === "done").length === 2);
  await until(() => !isBusy(group.id, design.id));

  expect(db.listMessages(group.id).map((m) => (m.author === "bot" ? m.parts : m.author))).toEqual([
    "user",
    [{ type: "text", text: `Fixed. <@${design.id}> over to you.` }],
    [{ type: "text", text: "[pass]" }],
  ]);
});

test("a reply that stops partway through the pass token is kept", async () => {
  const fixtures = bot("Fixtures");
  replies.set("Fixtures", ["[p"]);
  const group = db.createThread("group", [fixtures.id], "Parser");
  await postUserMessage(group.id, [{ type: "text", text: "output exactly: [p" }]);
  await until(() => db.listMessages(group.id).some((m) => m.author === "bot" && m.status === "done"));

  expect(db.listMessages(group.id).map((m) => (m.author === "bot" ? m.parts : m.author))).toEqual(["user", [{ type: "text", text: "[p" }]]);
});
