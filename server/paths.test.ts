import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { within } from "./paths";

const tmp = mkdtempSync(join(tmpdir(), "fabs-within-"));
const desk = join(tmp, "desk");
const outside = join(tmp, "outside");
mkdirSync(desk);
mkdirSync(outside);
writeFileSync(join(desk, "plan.md"), "# Plan");
writeFileSync(join(outside, "secret.txt"), "secret");
symlinkSync("plan.md", join(desk, "plan-link.md"));
symlinkSync(join(outside, "secret.txt"), join(desk, "notes.txt"));
symlinkSync(outside, join(desk, "out"));
symlinkSync(desk, join(tmp, "desk-link"));

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("within", () => {
  test("refuses a symlink that points outside the root", () => {
    expect(within(desk, "notes.txt")).toBeNull();
    expect(within(desk, "out/secret.txt")).toBeNull();
  });

  test("keeps a symlink that stays inside the root", () => {
    expect(within(desk, "plan-link.md")).toBe(join(desk, "plan-link.md"));
  });

  test("accepts a root that is itself a symlink", () => {
    const root = join(tmp, "desk-link");
    expect(within(root, "")).toBe(root);
    expect(within(root, "plan-link.md")).toBe(join(root, "plan-link.md"));
    expect(within(root, "notes.txt")).toBeNull();
  });

  test("refuses a path that does not exist", () => {
    expect(within(desk, "missing.md")).toBeNull();
    expect(within(desk, "out/missing.md")).toBeNull();
  });
});
