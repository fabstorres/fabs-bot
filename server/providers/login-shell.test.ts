import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergePath, readLoginShellPath } from "./login-shell";

const tmp = mkdtempSync(join(tmpdir(), "fabs-login-shell-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function fakeShell(name: string, script: string): string {
  const file = join(tmp, name);
  writeFileSync(file, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  return file;
}

test("login shell entries come first and repeats keep their first position", () => {
  const shell = "/home/u/.local/bin:/home/u/.local/bin:/usr/local/bin:/usr/bin";
  const inherited = "/opt/app/bin:/usr/local/bin:/usr/bin";
  expect(mergePath(shell, inherited, "/home/u/.local/bin", "/opt/homebrew/bin")).toBe(
    "/home/u/.local/bin:/usr/local/bin:/usr/bin:/opt/app/bin:/opt/homebrew/bin",
  );
});

test("keeps spaces that are part of a directory name", () => {
  expect(mergePath("/tmp/tool bin :/usr/bin", " /opt/lead")).toBe("/tmp/tool bin :/usr/bin: /opt/lead");
});

test("ignores what rc files print around the PATH", () => {
  const shell = fakeShell("noisy", `echo "Welcome back"\nprintf 'no newline'\nexport PATH="/from/rc:$PATH"\nexec /bin/sh -c "$2"`);
  expect(readLoginShellPath(shell)?.split(":")[0]).toBe("/from/rc");
});

test("gives up on a shell that hangs and ignores SIGTERM, like an interactive zsh", () => {
  const shell = fakeShell("stuck", `trap '' TERM\nexec sleep 10`);
  const started = performance.now();
  expect(readLoginShellPath(shell, 200)).toBeUndefined();
  expect(performance.now() - started).toBeLessThan(2000);
  expect(readLoginShellPath(join(tmp, "missing"))).toBeUndefined();
});
