import type { ProviderId, ProviderInfo } from "../../shared/types";
import { claude } from "./claude";
import { codex } from "./codex";
import { cursor, gemini, opencode } from "./others";
import { childEnv, which } from "./spawn";
import type { Provider } from "./types";

export const providers: Record<ProviderId, Provider> = { claude, codex, cursor, opencode, gemini };

let cache: ProviderInfo[] | null = null;

export async function providerInfo(refresh = false): Promise<ProviderInfo[]> {
  if (cache && !refresh) return cache;
  cache = await Promise.all(
    Object.values(providers).map(async (p) => {
      const bin = which(p.bin);
      let version = "";
      if (bin) {
        try {
          const proc = Bun.spawn([bin, "--version"], { env: childEnv, stdout: "pipe", stderr: "ignore" });
          const timer = setTimeout(() => proc.kill(), 5000);
          version = (await new Response(proc.stdout).text()).trim().split("\n")[0] ?? "";
          clearTimeout(timer);
        } catch {}
      }
      return {
        id: p.id,
        label: p.label,
        installed: !!bin,
        version,
        supportsTools: p.supportsTools,
        note: p.note,
        models: p.models,
      };
    }),
  );
  return cache;
}
