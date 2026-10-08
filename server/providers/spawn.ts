import { homedir } from "node:os";
import { join } from "node:path";

const home = homedir();
/** Make CLIs installed in user-local dirs reachable even when we run as a service with a bare PATH. */
const extraPath = [
  join(home, ".local/bin"),
  join(home, ".bun/bin"),
  join(home, ".local/share/pnpm"),
  join(home, ".npm-global/bin"),
  join(home, ".cargo/bin"),
  "/usr/local/bin",
  "/opt/homebrew/bin",
];
export const childEnv: Record<string, string> = {
  ...(process.env as Record<string, string>),
  PATH: [process.env.PATH ?? "", ...extraPath].filter(Boolean).join(":"),
};

export function which(bin: string): string | null {
  return Bun.which(bin, { PATH: childEnv.PATH });
}

export interface SpawnLinesOptions {
  cmd: string[];
  cwd: string;
  stdin?: string;
  signal: AbortSignal;
  env?: Record<string, string>;
  onLine: (line: string) => void;
}

/** Spawn a CLI, feed it stdin, and call onLine for each stdout line. Resolves with exit code + stderr tail. */
export async function spawnLines(o: SpawnLinesOptions): Promise<{ code: number; stderr: string }> {
  const bin = which(o.cmd[0]!);
  if (!bin) throw new Error(`${o.cmd[0]} is not installed or not on PATH`);
  const proc = Bun.spawn([bin, ...o.cmd.slice(1)], {
    cwd: o.cwd,
    env: { ...childEnv, ...o.env },
    stdin: o.stdin !== undefined ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let force: ReturnType<typeof setTimeout> | undefined;
  const kill = () => {
    proc.kill("SIGTERM");
    force = setTimeout(() => proc.kill("SIGKILL"), 3000);
  };
  o.signal.addEventListener("abort", kill, { once: true });

  if (o.stdin !== undefined && proc.stdin) {
    proc.stdin.write(o.stdin);
    await proc.stdin.end();
  }

  let stderr = "";
  const errPump = (async () => {
    for await (const chunk of proc.stderr as ReadableStream<Uint8Array>) {
      stderr = (stderr + new TextDecoder().decode(chunk)).slice(-4000);
    }
  })();

  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) o.onLine(line);
    }
  }
  if (buf.trim()) o.onLine(buf.trim());
  const code = await proc.exited;
  clearTimeout(force);
  await errPump;
  o.signal.removeEventListener("abort", kill);
  return { code, stderr };
}

export function parseJson(line: string): any | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function clip(s: string, n = 120): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
}

/** One-line human summary of a tool call input. */
export function summarizeToolInput(name: string, input: any): string {
  if (!input || typeof input !== "object") return "";
  const pick =
    input.command ?? input.cmd ?? input.file_path ?? input.path ?? input.pattern ?? input.query ?? input.url ??
    input.description ?? input.prompt ?? input.message ?? input.bot ?? input.title;
  if (typeof pick === "string") return clip(pick);
  if (Array.isArray(pick)) return clip(pick.join(" "));
  const json = JSON.stringify(input);
  return json === "{}" ? "" : clip(json);
}
