import { useRef, useState, type ReactNode } from "react";
import { Clock, Gauge, RefreshCw, RotateCcw, TrendingDown, TrendingUp, X } from "lucide-react";
import type { LimitsProviderId, ProviderLimits, UsageWindow } from "../../../shared/types";
import { api } from "../api";
import { useLoad, useNow } from "../hooks";
import { closeLimits } from "../store";
import { ProviderIcon } from "./ProviderIcon";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const PROVIDERS: { id: LimitsProviderId; label: string; color: string; unavailable: string }[] = [
  {
    id: "claude",
    label: "Claude Code",
    color: "#c4704f",
    unavailable: "Claude Code doesn't report usage limits for this login. Sign in with a Claude subscription to see them.",
  },
  {
    id: "codex",
    label: "Codex",
    color: "var(--muted-foreground)",
    unavailable: "Codex doesn't report usage limits for this login. Sign in with ChatGPT to see them.",
  },
];

const PACE = {
  ahead: { label: "Ahead of pace: spending faster than the window passes", Icon: TrendingUp },
  on: { label: "On pace with the window", Icon: Gauge },
  under: { label: "Under pace: headroom left for the rest of the window", Icon: TrendingDown },
};

type Provider = (typeof PROVIDERS)[number];

function useLimits(id: LimitsProviderId) {
  const loaded = useLoad(() => api.get<ProviderLimits>(`/api/providers/${id}/limits`), []);
  const [fresh, setFresh] = useState<ProviderLimits>();
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState("");
  const refresh = () => {
    setRefreshing(true);
    setFailure("");
    api
      .get<ProviderLimits>(`/api/providers/${id}/limits?refresh=1`)
      .then(setFresh, (e: Error) => setFailure(e.message))
      .finally(() => setRefreshing(false));
  };
  const limits = fresh ?? loaded.data;
  const checking = refreshing || (!loaded.data && !loaded.error);
  const problem = failure || (!fresh && loaded.error) || limits?.error || "";
  return { limits, checking, problem, refresh };
}

type Loaded = ReturnType<typeof useLimits>;

export function LimitsDialog() {
  const claude = useLimits("claude");
  const codex = useLimits("codex");
  const loaded = { claude, codex };
  const now = useNow(30_000);
  const title = useRef<HTMLHeadingElement>(null);
  const checking = claude.checking || codex.checking;
  const checkedAt = Math.min(...[claude, codex].flatMap((p) => (p.limits ? [p.limits.checkedAt] : [])));

  return (
    <Dialog open onOpenChange={(open) => !open && closeLimits()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-dvh max-w-full flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-full md:h-[min(48rem,calc(100dvh-2rem))] md:max-w-6xl md:rounded-2xl md:border"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          title.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById("open-limits")?.focus();
        }}
      >
        <header className="flex h-14 flex-none items-center gap-2 border-b pr-3 pl-4 md:pl-6">
          <DialogTitle ref={title} tabIndex={-1} className="text-lg font-semibold tracking-tight outline-none">
            Limits
          </DialogTitle>
          <DialogDescription className="sr-only">Usage left on this PC's Claude Code and Codex logins.</DialogDescription>
          <span role="status" className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {checking ? "Checking…" : Number.isFinite(checkedAt) && `Checked ${ago(checkedAt, now)}`}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={() => [claude, codex].forEach((p) => p.refresh())}
            disabled={checking}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className={cn("size-5", checking && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={closeLimits} aria-label="Close limits" title="Close limits">
            <X className="size-5" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TooltipProvider>
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-6 md:px-8 md:py-8">
              {PROVIDERS.map((p) => (
                <ProviderSection key={p.id} provider={p} loaded={loaded[p.id]} now={now} />
              ))}
            </div>
          </TooltipProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProviderSection({ provider, loaded, now }: { provider: Provider; loaded: Loaded; now: number }) {
  const { limits, checking, problem } = loaded;
  const ok = limits?.status === "ok";
  return (
    <section aria-labelledby={`limits-${provider.id}`} className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-medium">
        <ProviderIcon id={provider.id} className="size-5 [&>svg]:size-[18px]!" />
        <span id={`limits-${provider.id}`}>{provider.label}</span>
        {limits?.plan && <span className="text-sm font-normal text-muted-foreground">{limits.plan}</span>}
      </h3>
      {ok && problem && <p className="text-xs text-destructive">Couldn't refresh: {problem.replace(/\.$/, "")}. Showing the last result.</p>}
      {!limits && checking && <Loading />}
      {!limits && !checking && problem && <Note>{problem}</Note>}
      {limits?.status === "not-installed" && <Note>{provider.label} isn't installed on this PC. If it lives somewhere else, set its binary path in Settings → Providers.</Note>}
      {limits?.status === "unavailable" && <Note>{provider.unavailable}</Note>}
      {limits?.status === "error" && <Note>{problem}</Note>}
      {ok && <Usage limits={limits} provider={provider} now={now} />}
    </section>
  );
}

function Usage({ limits, provider, now }: { limits: ProviderLimits; provider: Provider; now: number }) {
  const windows = limits.windows.filter((w) => w.id !== "extra_usage");
  const extra = limits.windows.find((w) => w.id === "extra_usage");
  const creditsUnder = windows.find((w) => w.label === "Weekly") ?? windows.at(-1);
  return (
    <>
      {windows.map((w) => (
        <WindowCard key={w.id} window={w} color={provider.color} now={now}>
          {w === creditsUnder && limits.resetCredits && <ResetCredits {...limits.resetCredits} now={now} />}
        </WindowCard>
      ))}
      {windows.length === 0 && <Note>{provider.label} didn't report any usage windows.</Note>}
      {(extra || limits.credits) && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
          {extra && <span>Extra usage · {Math.round(extra.usedPercent)}% used</span>}
          {limits.credits && <span>Credits · {limits.credits}</span>}
        </p>
      )}
    </>
  );
}

function WindowCard({ window: w, color, now, children }: { window: UsageWindow; color: string; now: number; children?: ReactNode }) {
  const left = Math.round(clamp(100 - w.usedPercent));
  const timeLeft = w.resetsAt && w.durationMins ? Math.round(clamp(((w.resetsAt - now) / (w.durationMins * 60_000)) * 100)) : undefined;
  const pace = timeLeft === undefined ? undefined : left < timeLeft - 5 ? PACE.ahead : left > timeLeft + 5 ? PACE.under : PACE.on;
  return (
    <div role="group" aria-label={w.label} className="grid items-center gap-x-6 gap-y-3 rounded-xl border p-4 md:grid-cols-[11rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{w.label}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tabular-nums">{left}%</span>
          <span className="text-sm text-muted-foreground">left</span>
          {pace && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span role="img" tabIndex={0} aria-label={pace.label} className="self-center text-muted-foreground outline-none focus-visible:text-foreground">
                  <pace.Icon className="size-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{pace.label}</TooltipContent>
            </Tooltip>
          )}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="relative">
          <div
            role="img"
            aria-label={`${left}% left${timeLeft === undefined ? "" : `, ${timeLeft}% of the window left`}`}
            className="relative h-9 overflow-hidden rounded-lg bg-muted/40"
          >
            <div className="absolute inset-0 opacity-40" style={{ backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 1px, transparent 1px 6px)` }} />
            <div className="absolute inset-y-0 left-0 rounded-lg bg-muted" style={{ width: `${left}%` }}>
              <div className="size-full rounded-lg opacity-55" style={{ backgroundColor: color }} />
            </div>
            {timeLeft !== undefined && (
              <span className="absolute inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-background" style={{ left: `clamp(4px, ${timeLeft}%, calc(100% - 4px))` }} />
            )}
          </div>
          {w.resetsAt && (
            <Exact at={w.resetsAt} className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md bg-background/85 px-1.5 py-0.5 text-xs">
              <Clock className="size-3" />
              <span className="sr-only">Resets in </span>
              {span(w.resetsAt - now)}
            </Exact>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function ResetCredits({ available, nextExpiresAt, now }: { available: number; nextExpiresAt?: number; now: number }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <RotateCcw className="size-3" />
      {available} {available === 1 ? "reset" : "resets"} available
      {nextExpiresAt && (
        <>
          {" · "}
          <Exact at={nextExpiresAt}>next expires in {span(nextExpiresAt - now)}</Exact>
        </>
      )}
    </p>
  );
}

function Exact({ at, className, children }: { at: number; className?: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn("flex w-fit items-center gap-1 tabular-nums outline-none focus-visible:underline", className)}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{new Date(at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</TooltipContent>
    </Tooltip>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border p-4 text-sm text-muted-foreground">{children}</p>;
}

function Loading() {
  return (
    <div role="status" aria-label="Loading limits" className="grid items-center gap-x-6 gap-y-3 rounded-xl border p-4 md:grid-cols-[11rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="h-9 w-full rounded-lg" />
    </div>
  );
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));

function span(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours) return mins % 60 ? `${hours}h ${mins % 60}m` : `${hours}h`;
  return mins ? `${mins}m` : "under a minute";
}

const ago = (at: number, now: number) => (now - at < 60_000 ? "just now" : `${span(now - at)} ago`);
