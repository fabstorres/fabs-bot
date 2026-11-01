import { useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import type { LimitsProviderId, ProviderLimits, UsageWindow } from "../../../shared/types";
import { api } from "../api";
import { useLoad, useNow } from "../hooks";
import { closeLimits, openLimitsSection } from "../store";
import { ProviderIcon } from "./ProviderIcon";
import { SectionDialog, type DialogSection } from "./SectionDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const icon = (id: LimitsProviderId) => ({ className }: { className?: string }) => <ProviderIcon id={id} className={cn("[&>svg]:size-[18px]!", className)} />;

const SECTIONS: DialogSection<LimitsProviderId>[] = [
  { id: "claude", label: "Claude Code", Icon: icon("claude"), keywords: "anthropic usage session weekly extra usage plan" },
  { id: "codex", label: "Codex", Icon: icon("codex"), keywords: "openai chatgpt usage session weekly monthly credits reset plan" },
];

const UNAVAILABLE: Record<LimitsProviderId, string> = {
  claude: "Claude Code doesn't report usage limits for this login. Sign in with a Claude subscription to see them.",
  codex: "Codex doesn't report usage limits for this login. Sign in with ChatGPT to see them.",
};

export function LimitsDialog({ section }: { section?: LimitsProviderId }) {
  const shown = SECTIONS.find((s) => s.id === section);
  return (
    <SectionDialog title="Limits" description="Usage limits of the agent CLIs on this PC." sections={SECTIONS} section={section} onSection={openLimitsSection} onClose={closeLimits}>
      {shown && <LimitsPage key={shown.id} id={shown.id} label={shown.label} />}
    </SectionDialog>
  );
}

function LimitsPage({ id, label }: { id: LimitsProviderId; label: string }) {
  const loaded = useLoad(() => api.get<ProviderLimits>(`/api/providers/${id}/limits`), []);
  const [fresh, setFresh] = useState<ProviderLimits>();
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState("");
  const now = useNow(30_000);
  const limits = fresh ?? loaded.data;
  const checking = refreshing || (!loaded.data && !loaded.error);
  const problem = failure || (!fresh && loaded.error) || limits?.error;
  const refresh = () => {
    setRefreshing(true);
    setFailure("");
    api
      .get<ProviderLimits>(`/api/providers/${id}/limits?refresh=1`)
      .then(setFresh, (e: Error) => setFailure(e.message))
      .finally(() => setRefreshing(false));
  };

  return (
    <TooltipProvider>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">What's left of {label}'s usage on this PC's login. Read straight from the CLI, without starting a chat.</p>
          <Button variant="ghost" size="sm" className="flex-none rounded-full text-muted-foreground" onClick={refresh} disabled={checking}>
            <RefreshCw className={cn(checking && "animate-spin")} />
            <span className="sr-only">Refresh</span>
            {checking ? "Checking…" : limits ? `Checked ${ago(limits.checkedAt, now)}` : "Check"}
          </Button>
        </div>
        {problem && (
          <Alert variant="destructive">
            <AlertDescription>{limits?.status === "ok" ? `Couldn't refresh: ${problem.replace(/\.$/, "")}. Showing the last result.` : problem}</AlertDescription>
          </Alert>
        )}
        {!limits && checking && <Loading />}
        {limits?.status === "not-installed" && <Note>{label} isn't installed on this PC. If it lives somewhere else, set its binary path in Settings → Providers.</Note>}
        {limits?.status === "unavailable" && <Note>{UNAVAILABLE[id]}</Note>}
        {limits?.status === "ok" && <Usage limits={limits} label={label} now={now} />}
      </div>
    </TooltipProvider>
  );
}

function Usage({ limits, label, now }: { limits: ProviderLimits; label: string; now: number }) {
  const resets = limits.resetCredits;
  return (
    <>
      <div className="flex flex-col divide-y rounded-2xl border">
        {limits.windows.map((w) => (
          <WindowRow key={w.id} window={w} now={now} />
        ))}
        {limits.windows.length === 0 && <p className="p-4 text-sm text-muted-foreground">{label} didn't report any usage windows.</p>}
      </div>
      {(limits.plan || limits.credits || resets) && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 rounded-2xl border p-4 text-sm">
          {limits.plan && <Fact term="Plan">{limits.plan}</Fact>}
          {limits.credits && <Fact term="Credits">{limits.credits}</Fact>}
          {resets && (
            <Fact term="Reset credits">
              {resets.available} available
              {resets.nextExpiresAt && (
                <>
                  {" · "}
                  <Exact at={resets.nextExpiresAt}>next expires in {span(resets.nextExpiresAt - now)}</Exact>
                </>
              )}
            </Fact>
          )}
        </dl>
      )}
    </>
  );
}

function WindowRow({ window: w, now }: { window: UsageWindow; now: number }) {
  const left = Math.round(Math.min(100, Math.max(0, 100 - w.usedPercent)));
  return (
    <div role="group" aria-label={w.label} className="flex flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{w.label}</span>
        <span className="text-sm tabular-nums">{left}% left</span>
      </div>
      <Progress value={left} aria-label={`${w.label} left`} className="h-1.5" />
      {w.resetsAt && (
        <Exact at={w.resetsAt} className="text-muted-foreground">
          Resets in {span(w.resetsAt - now)}
        </Exact>
      )}
    </div>
  );
}

function Exact({ at, className, children }: { at: number; className?: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn("w-fit text-sm outline-none focus-visible:underline", className)}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{new Date(at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</TooltipContent>
    </Tooltip>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{term}</dt>
      <dd>{children}</dd>
    </>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border p-4 text-sm text-muted-foreground">{children}</p>;
}

function Loading() {
  return (
    <div role="status" aria-label="Loading limits" className="flex flex-col gap-4 rounded-2xl border p-4">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-1.5 w-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

function span(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours) return mins % 60 ? `${hours}h ${mins % 60}m` : `${hours}h`;
  return mins ? `${mins}m` : "under a minute";
}

const ago = (at: number, now: number) => (now - at < 60_000 ? "just now" : `${span(now - at)} ago`);
