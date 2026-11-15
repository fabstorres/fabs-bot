import { afterEach, beforeEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../../../..");
let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fabs-lint-test-"));
  for (const dir of ["server", "shared", "web/src", "desktop", "scripts"]) mkdirSync(join(scratch, dir), { recursive: true });
  symlinkSync(join(repo, "node_modules"), join(scratch, "node_modules"), "junction");
  for (const name of [".oxlintrc.json", "tsconfig.json", "scripts/lint.mjs"]) copyFileSync(join(repo, name), join(scratch, name));
  writeFileSync(join(scratch, "lint-baseline.json"), "{}");
});

afterEach(() => rmSync(scratch, { recursive: true, force: true }));

function lint(source: string, baseline = {}) {
  writeFileSync(join(scratch, "server/input.ts"), source);
  writeFileSync(join(scratch, "lint-baseline.json"), JSON.stringify(baseline));
  const result = spawnSync("node", [join(scratch, "scripts/lint.mjs")], { encoding: "utf8" });
  return { code: result.status, output: result.stdout + result.stderr };
}

test("a baseline allowance cannot hide additional unsafe assignments in the same file", () => {
  const baseline = { "server/input.ts": { "typescript(no-unsafe-assignment)": 1 } };
  expect(lint('export const input = JSON.parse("{}");', baseline).code).toBe(0);
  const extra = lint('export const input = JSON.parse("{}"); export const other = JSON.parse("{}");', baseline);
  expect(extra.code).toBe(1);
  expect(extra.output).toContain("increased from 1 to 2");
});

test("fixing an existing violation requires pruning its allowance", () => {
  const result = lint('export const input: unknown = JSON.parse("{}");', {
    "server/input.ts": { "typescript(no-unsafe-assignment)": 1 },
  });
  expect(result.code).toBe(1);
  expect(result.output).toContain("improved from 1 to 0");
});

test("the upload inference regression is rejected even when its explicit any is already baselined", () => {
  const result = lint('export function upload(args: any) { const paths = (Array.isArray(args.paths) ? args.paths : [args.paths]).filter(Boolean).map(String); return paths.map((p) => p.trim()); }', {
    "server/input.ts": { "typescript(no-explicit-any)": 1 },
  });
  expect(result.code).toBe(1);
  expect(result.output).toContain("typescript(no-unsafe-assignment) increased from 0 to 1");
});

test("new files have no allowance for explicit any", () => {
  const result = lint('export const input: any = "value";');
  expect(result.code).toBe(1);
  expect(result.output).toContain("typescript(no-explicit-any) increased from 0 to 1");
});

test("syntax errors fail even if a baseline tries to allow unclassified diagnostics", () => {
  const result = lint("export const input = ;", { "server/input.ts": { undefined: 1 } });
  expect(result.code).toBe(1);
  expect(result.output).toContain("Unexpected token");
});
