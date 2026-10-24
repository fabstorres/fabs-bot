import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const escapes = (root: string, full: string) => {
  const r = relative(root, full);
  return r === ".." || r.startsWith(`..${sep}`) || isAbsolute(r) || resolve(root, r) !== full;
};

export function realPathWithin(root: string, rel: string): string | null {
  const full = resolve(root, rel || ".");
  if (escapes(root, full)) return null;
  try {
    const real = realpathSync(full);
    return escapes(realpathSync(root), real) ? null : real;
  } catch {
    return null;
  }
}

export function within(root: string, rel: string): string | null {
  return realPathWithin(root, rel) ? resolve(root, rel || ".") : null;
}
