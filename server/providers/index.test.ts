import { expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "fabs-providers-test-"));
process.env.FABS_DATA_DIR = join(scratch, "data");
process.env.FABS_WORK_ROOT = join(scratch, "work");
const { providerInfo, updateProvider } = await import("./index");

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
