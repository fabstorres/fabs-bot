import { userInfo } from "node:os";

const MARKER = "__FABS_BOT_PATH__";
const PATH_LINE = new RegExp(`${MARKER}\\n(.*)\\n${MARKER}`);

export function readLoginShellPath(shell: string, timeout = 5000): string | undefined {
  try {
    const { stdout } = Bun.spawnSync([shell, "-ilc", `printf '%s\\n' ${MARKER}; printenv PATH; printf '%s\\n' ${MARKER}`], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
      timeout,
      killSignal: "SIGKILL",
      detached: true,
    });
    return stdout.toString().match(PATH_LINE)?.[1]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function loginShellPath(): string | undefined {
  for (const shell of new Set([process.env.SHELL, userShell()])) {
    const path = shell ? readLoginShellPath(shell) : undefined;
    if (path) return path;
  }
  return undefined;
}

function userShell(): string | null {
  try {
    return userInfo().shell;
  } catch {
    return null;
  }
}

export function mergePath(...paths: (string | undefined)[]): string {
  const entries = paths.flatMap((path) => path?.split(":") ?? []).map((entry) => entry.trim());
  return [...new Set(entries.filter(Boolean))].join(":");
}
