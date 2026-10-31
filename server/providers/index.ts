import { homedir } from "node:os";
import { ENV_NAME, type ProviderId, type ProviderInfo, type ProviderSettings } from "../../shared/types";
import { getSetting, setSetting } from "../db";
import { claude } from "./claude";
import { codex } from "./codex";
import { cursor, gemini, opencode } from "./others";
import { childEnv, which } from "./spawn";
import type { Launch, Provider } from "./types";

export const providers: Record<ProviderId, Provider> = { claude, codex, cursor, opencode, gemini };

export const isProviderId = (id: string): id is ProviderId => Object.hasOwn(providers, id);

const DEFAULT_SETTINGS: ProviderSettings = { enabled: true, displayName: "", binaryPath: "", launchArgs: "", env: {} };

export function providerSettings(id: ProviderId): ProviderSettings {
  const saved = getSetting(`provider.${id}`);
  return { ...DEFAULT_SETTINGS, ...(saved ? JSON.parse(saved) : {}) };
}

export function launchFor(id: ProviderId): Launch {
  const settings = providerSettings(id);
  return {
    bin: settings.binaryPath.replace(/^~(?=\/|$)/, homedir()) || providers[id].bin,
    args: settings.launchArgs.split(/\s+/).filter(Boolean),
    env: settings.env,
  };
}

async function inspect(p: Provider): Promise<ProviderInfo> {
  const launch = launchFor(p.id);
  const path = which(launch.bin);
  let version = "";
  if (path) {
    try {
      const proc = Bun.spawn([path, "--version"], { env: { ...childEnv, ...launch.env }, stdout: "pipe", stderr: "ignore" });
      const timer = setTimeout(() => proc.kill(), 5000);
      const line = (await new Response(proc.stdout).text()).trim().split("\n")[0] ?? "";
      version = line.match(/\d+\.\d+[\w.+-]*/)?.[0] ?? line;
      clearTimeout(timer);
    } catch {}
  }
  return {
    id: p.id,
    label: p.label,
    bin: p.bin,
    path,
    installed: !!path,
    version,
    supportsTools: p.supportsTools,
    note: p.note,
    models: p.models,
    settings: providerSettings(p.id),
    checkedAt: Date.now(),
  };
}

let cache: ProviderInfo[] | null = null;
let probing: Promise<ProviderInfo[]> | null = null;

export async function providerInfo(refresh = false): Promise<ProviderInfo[]> {
  if (cache && !refresh) return cache;
  probing ??= Promise.all(Object.values(providers).map(inspect))
    .then((list) => (cache = list))
    .finally(() => (probing = null));
  return probing;
}

export async function updateProvider(id: ProviderId, patch: Partial<ProviderSettings>): Promise<ProviderInfo> {
  const next = providerSettings(id);
  if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
  for (const key of ["displayName", "binaryPath", "launchArgs"] as const) {
    const value = patch[key];
    if (typeof value === "string") next[key] = value.trim();
  }
  if (patch.env && typeof patch.env === "object") {
    next.env = Object.fromEntries(Object.entries(patch.env).filter(([name, value]) => ENV_NAME.test(name) && typeof value === "string"));
  }
  setSetting(`provider.${id}`, JSON.stringify(next));
  await probing;
  const info = await inspect(providers[id]);
  if (cache) cache = cache.map((p) => (p.id === id ? info : p));
  return info;
}
