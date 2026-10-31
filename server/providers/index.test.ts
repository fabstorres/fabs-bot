import { expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "fabs-providers-test-"));
process.env.FABS_DATA_DIR = join(scratch, "data");
process.env.FABS_WORK_ROOT = join(scratch, "work");
const { providerInfo, updateProvider } = await import("./index");
const { setSetting } = await import("../db");

test("a save made while a check runs survives that check's older result", async () => {
  const slow = join(scratch, "slow-cli");
  writeFileSync(slow, "#!/bin/sh\nsleep 0.3\necho 1.0.0\n");
  chmodSync(slow, 0o755);
  await updateProvider("gemini", { binaryPath: slow });
  await updateProvider("claude", { binaryPath: join(scratch, "missing") });

  const check = providerInfo(true);
  await updateProvider("claude", { enabled: false });
  await check;

  const claude = (await providerInfo()).find((p) => p.id === "claude");
  expect(claude?.settings.enabled).toBe(false);
});

test("a version command that ignores SIGTERM and leaves stdout open still lets saves through at the deadline", async () => {
  const stuck = join(scratch, "stuck-cli");
  writeFileSync(stuck, "#!/bin/sh\ntrap '' TERM\nsleep 8\n");
  chmodSync(stuck, 0o755);
  setSetting("provider.cursor", JSON.stringify({ binaryPath: stuck }));

  const started = Date.now();
  const check = providerInfo(true);
  await updateProvider("claude", { enabled: true });
  const saveMs = Date.now() - started;

  expect(saveMs).toBeLessThan(6500);
  expect((await check).find((p) => p.id === "cursor")?.version).toBe("");
}, 15_000);
