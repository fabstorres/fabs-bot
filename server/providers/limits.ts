import { tmpdir } from "node:os";
import type { LimitsProviderId, ProviderLimits, UsageWindow } from "../../shared/types";
import { VERSION } from "../config";
import { launchFor, providers } from "./index";
import type { Launch } from "./types";
import { childEnv, parseJson, which } from "./spawn";

type Probe = Omit<ProviderLimits, "provider" | "checkedAt">;
type Peer = { send: (message: object) => void; reply: (match: (message: any) => boolean) => Promise<any> };

const PROBE_TIMEOUT_MS = 15_000;
const CACHE_MS = 60_000;
const WEEK_MINS = 7 * 24 * 60;
const MONTH_MINS = 30 * 24 * 60;

export const isLimitsProviderId = (id: string): id is LimitsProviderId => id === "claude" || id === "codex";

async function converse<T>(id: LimitsProviderId, cmd: string[], env: Record<string, string>, script: (peer: Peer) => Promise<T>): Promise<T> {
  const label = providers[id].label;
  const proc = Bun.spawn(cmd, { cwd: tmpdir(), env: { ...childEnv, ...env }, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  const waiting = new Set<{ match: (message: any) => boolean; resolve: (message: any) => void }>();
  let stderr = "";

  const errPump = (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of proc.stderr) stderr = (stderr + decoder.decode(chunk, { stream: true })).slice(-2000);
  })();
  const outPump = (async () => {
    const decoder = new TextDecoder();
    let buf = "";
    for await (const chunk of proc.stdout) {
      buf += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const message = parseJson(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
        if (!message) continue;
        for (const w of waiting) {
          if (!w.match(message)) continue;
          waiting.delete(w);
          w.resolve(message);
        }
      }
    }
  })();

  const peer: Peer = {
    send: (message) => {
      proc.stdin.write(JSON.stringify(message) + "\n");
      proc.stdin.flush();
    },
    reply: (match) => new Promise((resolve) => waiting.add({ match, resolve })),
  };
  const died = Promise.all([proc.exited, outPump, errPump]).then(() => {
    const last = stderr.trim().split("\n").pop()?.trim();
    throw new Error(last ? `${label} stopped: ${last}` : `${label} stopped before it reported usage.`);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} didn't report usage within ${PROBE_TIMEOUT_MS / 1000}s.`)), PROBE_TIMEOUT_MS);
  });
  died.catch(() => {});

  try {
    return await Promise.race([script(peer), died, timeout]);
  } finally {
    clearTimeout(timer);
    proc.kill();
    const force = setTimeout(() => proc.kill("SIGKILL"), 3000);
    void proc.exited.then(() => clearTimeout(force));
  }
}

const planName = (plan: unknown) => (typeof plan === "string" && plan ? plan[0]!.toUpperCase() + plan.slice(1).replace(/_/g, " ") : undefined);

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

function percentOf(used: unknown, limit: unknown) {
  return finite(used) && finite(limit) && used >= 0 && limit > 0 ? (used / limit) * 100 : undefined;
}

function usageWindow(id: string, label: string, usedPercent: unknown, resetsAt: number | undefined): UsageWindow[] {
  if (!finite(usedPercent)) return [];
  return [{ id, label, usedPercent, ...(resetsAt ? { resetsAt } : {}) }];
}

function fromIso(value: unknown) {
  const ms = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : undefined;
}

const fromSeconds = (value: unknown) => (finite(value) && value > 0 ? value * 1000 : undefined);

function claudeExtraUsage(limits: any) {
  const spend = limits.spend;
  if (spend?.enabled && spend.used?.currency === spend.limit?.currency && spend.used?.exponent === spend.limit?.exponent) {
    const percent = percentOf(spend.used?.amount_minor, spend.limit?.amount_minor);
    if (percent !== undefined) return percent;
  }
  const extra = limits.extra_usage;
  if (!extra?.is_enabled) return undefined;
  return percentOf(extra.used_credits, extra.monthly_limit) ?? extra.utilization;
}

export function claudeUsage(usage: any): Probe {
  const plan = planName(usage?.subscription_type);
  const limits = usage?.rate_limits;
  if (!usage?.rate_limits_available || !limits) return { status: "unavailable", plan, windows: [] };
  const scoped = Array.isArray(limits.model_scoped) ? limits.model_scoped : [];
  return {
    status: "ok",
    plan,
    windows: [
      ...usageWindow("five_hour", "Session", limits.five_hour?.utilization, fromIso(limits.five_hour?.resets_at)),
      ...usageWindow("seven_day", "Weekly", limits.seven_day?.utilization, fromIso(limits.seven_day?.resets_at)),
      ...scoped.flatMap((m: any) =>
        typeof m?.display_name === "string" ? usageWindow(`seven_day_${m.display_name}`, `Weekly · ${m.display_name}`, m.utilization, fromIso(m.resets_at)) : [],
      ),
      ...usageWindow("extra_usage", "Extra usage", claudeExtraUsage(limits), undefined),
    ],
  };
}

function codexLabel(mins: number) {
  if (mins >= MONTH_MINS) return "Monthly";
  if (mins >= WEEK_MINS) return "Weekly";
  return "Session";
}

function codexCredits(credits: any) {
  if (credits?.unlimited) return "Unlimited";
  const balance = Number(credits?.balance);
  return credits?.hasCredits && Number.isFinite(balance) ? balance.toFixed(2) : undefined;
}

export function codexUsage(result: any): Probe {
  const snapshot = result?.rateLimitsByLimitId?.codex ?? result?.rateLimits;
  const monthlyPlan = snapshot?.planType === "free" || snapshot?.planType === "go";
  const slots = [
    ["primary", snapshot?.primary, monthlyPlan ? MONTH_MINS : 300],
    ["secondary", snapshot?.secondary, WEEK_MINS],
  ] as const;
  const expiries = (result?.rateLimitResetCredits?.credits ?? [])
    .filter((c: any) => c?.status === "available" && finite(c.expiresAt))
    .map((c: any) => c.expiresAt as number);
  const resets = result?.rateLimitResetCredits;
  return {
    status: "ok",
    plan: planName(snapshot?.planType),
    windows: slots.flatMap(([id, w, fallback]) => usageWindow(id, codexLabel(finite(w?.windowDurationMins) ? w.windowDurationMins : fallback), w?.usedPercent, fromSeconds(w?.resetsAt))),
    credits: codexCredits(snapshot?.credits),
    ...(finite(resets?.availableCount)
      ? { resetCredits: { available: resets.availableCount, ...(expiries.length ? { nextExpiresAt: fromSeconds(Math.min(...expiries)) } : {}) } }
      : {}),
  };
}

async function probeClaude(bin: string, launch: Launch): Promise<Probe> {
  const cmd = [bin, ...launch.args, "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"];
  return converse("claude", cmd, launch.env, async (peer) => {
    const answer = (requestId: string) => peer.reply((m) => m.type === "control_response" && m.response?.request_id === requestId);
    const request = async (requestId: string, request: object) => {
      peer.send({ type: "control_request", request_id: requestId, request });
      const { response } = await answer(requestId);
      if (response.subtype === "error") throw new Error(response.error || "Claude Code couldn't read usage.");
      return response.response;
    };
    await request("init", { subtype: "initialize" });
    return claudeUsage(await request("usage", { subtype: "get_usage", skip_behaviors: true }));
  });
}

async function probeCodex(bin: string, launch: Launch): Promise<Probe> {
  return converse("codex", [bin, "app-server"], launch.env, async (peer) => {
    let next = 0;
    const request = async (method: string, params?: object) => {
      const id = ++next;
      peer.send({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
      const reply = await peer.reply((m) => m.id === id && ("result" in m || "error" in m));
      if (reply.error) throw new Error(reply.error.message || `Codex couldn't answer ${method}.`);
      return reply.result;
    };
    await request("initialize", { clientInfo: { name: "fabs-bot", version: VERSION } });
    peer.send({ jsonrpc: "2.0", method: "initialized" });
    const account = await request("account/read", {});
    if (!account?.account || account.account.type === "apiKey") return { status: "unavailable", windows: [] };
    return codexUsage(await request("account/rateLimits/read"));
  });
}

const probes = { claude: probeClaude, codex: probeCodex };

const cache = new Map<LimitsProviderId, { at: number; limits: ProviderLimits }>();
const lastGood = new Map<LimitsProviderId, ProviderLimits>();
const checking = new Map<LimitsProviderId, Promise<ProviderLimits>>();

async function check(id: LimitsProviderId): Promise<ProviderLimits> {
  const checkedAt = Date.now();
  const launch = launchFor(id);
  const bin = which(launch.bin);
  try {
    const probe: Probe = bin ? await probes[id](bin, launch) : { status: "not-installed", windows: [] };
    const limits = { provider: id, checkedAt, ...probe };
    if (limits.status === "ok") lastGood.set(id, limits);
    else lastGood.delete(id);
    return limits;
  } catch (e) {
    const error = (e as Error).message;
    const good = lastGood.get(id);
    return good ? { ...good, error } : { provider: id, status: "error", checkedAt, windows: [], error };
  }
}

export function providerLimits(id: LimitsProviderId, refresh = false): Promise<ProviderLimits> {
  const cached = cache.get(id);
  if (cached && !refresh && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.limits);
  let running = checking.get(id);
  if (!running) {
    running = check(id)
      .then((limits) => (cache.set(id, { at: Date.now(), limits }), limits))
      .finally(() => checking.delete(id));
    checking.set(id, running);
  }
  return running;
}
