import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const baseline = JSON.parse(readFileSync(new URL("../lint-baseline.json", import.meta.url), "utf8"));
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("../node_modules/oxlint/bin/oxlint", import.meta.url)),
  "server", "shared", "web/src", "desktop", "--format", "json",
], { cwd: root, encoding: "utf8" });

if (result.error || result.signal || result.status === null || result.status > 1) {
  console.error(result.error?.message ?? result.stderr ?? "Oxlint failed to run.");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
  if (!Array.isArray(report.diagnostics)) throw new Error("Missing lint diagnostics.");
} catch (error) {
  console.error("Could not read Oxlint's report:", error.message, result.stderr, result.stdout);
  process.exit(1);
}

const current = {};
let failed = false;
for (const diagnostic of report.diagnostics) {
  if (!["typescript(no-explicit-any)", "typescript(no-unsafe-assignment)"].includes(diagnostic.code)) {
    console.error(`${diagnostic.filename}: ${diagnostic.message}`);
    failed = true;
    continue;
  }
  const rules = current[diagnostic.filename] ??= {};
  rules[diagnostic.code] = (rules[diagnostic.code] ?? 0) + 1;
}

for (const file of new Set([...Object.keys(baseline), ...Object.keys(current)])) {
  const expected = baseline[file] ?? {};
  const actual = current[file] ?? {};
  for (const rule of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const before = expected[rule] ?? 0;
    const after = actual[rule] ?? 0;
    if (after === before) continue;
    failed = true;
    if (after < before) {
      console.error(`${file}: ${rule} improved from ${before} to ${after}. Reduce its count in lint-baseline.json.`);
      continue;
    }
    console.error(`${file}: ${rule} increased from ${before} to ${after}. Fix the new violations.`);
    for (const diagnostic of report.diagnostics.filter((d) => d.filename === file && d.code === rule)) {
      const position = diagnostic.labels?.[0]?.span;
      console.error(`  ${file}:${position?.line ?? 1}:${position?.column ?? 1} ${diagnostic.message}`);
    }
  }
}

if (result.status !== 0 && report.diagnostics.length === 0) {
  console.error("Oxlint failed without diagnostics.", result.stderr);
  process.exit(1);
}

if (failed) process.exit(1);
console.log(`Lint passed: ${report.number_of_files} files checked; ${report.diagnostics.length} existing violations baselined.`);
