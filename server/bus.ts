import type { BotStatus, Link, ServerEvent } from "../shared/types";

type Listener = (e: ServerEvent) => void;
const listeners = new Set<Listener>();

export function publish(e: ServerEvent) {
  for (const l of listeners) {
    try {
      l(e);
    } catch (err) {
      console.error("listener failed", err);
    }
  }
}
export function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// ---------- live state (not persisted) ----------

const statuses = new Map<string, BotStatus>();

export function getStatuses(): BotStatus[] {
  return [...statuses.values()];
}
export function getStatus(botId: string): BotStatus {
  return statuses.get(botId) ?? { botId, state: "idle", text: "", threadId: null, updatedAt: 0 };
}
export function setStatus(botId: string, patch: Partial<Omit<BotStatus, "botId">>) {
  const next: BotStatus = { ...getStatus(botId), ...patch, botId, updatedAt: Date.now() };
  statuses.set(botId, next);
  publish({ type: "status", status: next });
}

const links = new Map<string, Link>();
export function getLinks(): Link[] {
  return [...links.values()];
}
export function startLink(fromBotId: string, toBotId: string, threadId: string): string {
  const link: Link = { id: crypto.randomUUID(), fromBotId, toBotId, threadId, startedAt: Date.now() };
  links.set(link.id, link);
  publish({ type: "link.start", link });
  return link.id;
}
export function endLink(id: string) {
  if (links.delete(id)) publish({ type: "link.end", linkId: id });
}
