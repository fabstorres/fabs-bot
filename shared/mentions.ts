import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

interface Named {
  name: string;
}

export interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

export type Piece<B> = string | { bot: B; text: string };

const HANDLE_CHAR = "[\\p{L}\\p{N}_-]";

export const handleOf = (name: string) => name.replace(/\s+/g, "");

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function handlesOf(name: string): string[] {
  return [name, handleOf(name), slug(name)].map((h) => h.toLowerCase()).filter(Boolean);
}

export function splitMentions<B extends Named>(text: string, bots: B[]): Piece<B>[] {
  if (!text.includes("@")) return text ? [text] : [];
  const owners = new Map<string, Set<B>>();
  for (const bot of bots) for (const h of handlesOf(bot.name)) owners.set(h, (owners.get(h) ?? new Set()).add(bot));
  if (!owners.size) return [text];
  const handles = [...owners.keys()].sort((a, b) => b.length - a.length).map(escape);
  const pattern = new RegExp(`(?<!${HANDLE_CHAR})@(?:${handles.join("|")})(?!${HANDLE_CHAR})`, "giu");
  const pieces: Piece<B>[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const found = owners.get(m[0].slice(1).toLowerCase());
    if (found?.size !== 1) continue;
    pieces.push(text.slice(last, m.index), { bot: [...found][0]!, text: m[0] });
    last = m.index + m[0].length;
  }
  pieces.push(text.slice(last));
  return pieces.filter((p) => p !== "");
}

export function* textNodes(node: MdNode): Generator<{ node: MdNode; parent: MdNode }> {
  if (node.type === "link" || node.type === "linkReference") return;
  for (const child of node.children ?? []) {
    if (child.type === "text") yield { node: child, parent: node };
    else yield* textNodes(child);
  }
}

export function mentionedBots<B extends Named>(markdown: string, bots: B[]): B[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const found = new Set<B>();
  for (const { node } of textNodes(tree)) {
    for (const piece of splitMentions(node.value ?? "", bots)) if (typeof piece !== "string") found.add(piece.bot);
  }
  return [...found];
}
