import { Cron } from "croner";
import type { Routine } from "../shared/types";
import * as db from "./db";
import { publish } from "./bus";

const jobs = new Map<string, Cron>();

/** Rebuild cron jobs from the database. Cheap; call after any routine change. */
export function reschedule() {
  for (const j of jobs.values()) j.stop();
  jobs.clear();
  for (const r of db.listRoutines()) {
    if (!r.enabled) continue;
    try {
      jobs.set(r.id, new Cron(r.cron, { protect: true }, () => void fireRoutine(r.id)));
    } catch (e) {
      console.warn(`routine ${r.name}: bad cron "${r.cron}"`, e);
    }
  }
}

export function withNextRun(r: Routine): Routine {
  return { ...r, nextRunAt: jobs.get(r.id)?.nextRun()?.getTime() ?? null };
}

export async function fireRoutine(id: string) {
  const r = db.getRoutine(id);
  if (!r) return;
  // Imported lazily to avoid a cycle (orchestrator → mcp → scheduler).
  const { runTurn } = await import("./orchestrator");
  let thread = r.threadId ? db.getThread(r.threadId) : null;
  if (!thread) {
    thread = db.createThread("direct", [r.botId], r.name, { actor: "scheduler" });
    db.updateThread(thread.id, { topic: "Routine" });
  }
  db.markRoutineRun(r.id, thread.id);
  const m = db.addMessage({ threadId: thread.id, author: "system", parts: [{ type: "text", text: `⏰ Scheduled run of "${r.name}":\n${r.prompt}` }] });
  publish({ type: "message", message: m });
  const t = db.updateThread(thread.id, { preview: `⏰ ${r.name}` });
  if (t) publish({ type: "thread", thread: t });
  await runTurn(thread.id, r.botId);
}
