import { realpathSync } from "node:fs";
import { relative, resolve } from "node:path";

const escapes = (root: string, full: string) => {
  const r = relative(root, full);
  return r.startsWith("..") || resolve(root, r) !== full;
};

/** Resolve `rel` to an existing path inside `root`, refusing paths that escape it, by `../` or through a symlink. */
export function within(root: string, rel: string): string | null {
  const full = resolve(root, rel || ".");
  if (escapes(root, full)) return null;
  try {
    return escapes(realpathSync(root), realpathSync(full)) ? null : full;
  } catch {
    return null;
  }
}
