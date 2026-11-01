import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "fabs-limits-test-"));
process.env.FABS_DATA_DIR = join(scratch, "data");
process.env.FABS_WORK_ROOT = join(scratch, "work");
const { claudeUsage, codexUsage } = await import("./limits");

test("a Claude window without utilization is left out instead of reading as 0% used", () => {
  const usage = claudeUsage({
    rate_limits_available: true,
    rate_limits: { five_hour: { utilization: null, resets_at: null }, seven_day: { utilization: 40, resets_at: "2026-11-03T12:00:00+00:00" } },
  });
  expect(usage.windows.map((w) => w.id)).toEqual(["seven_day"]);
});

test("a Codex free plan without window durations reads its primary window as monthly", () => {
  const usage = codexUsage({ rateLimits: { planType: "free", primary: { usedPercent: 10 }, secondary: null } });
  expect(usage.windows).toEqual([{ id: "primary", label: "Monthly", usedPercent: 10 }]);
});

test("Codex prefers the codex limit over the top-level snapshot", () => {
  const usage = codexUsage({
    rateLimits: { limitId: "other", primary: { usedPercent: 90, windowDurationMins: 300 } },
    rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 20, windowDurationMins: 300 } } },
  });
  expect(usage.windows.map((w) => w.usedPercent)).toEqual([20]);
});
