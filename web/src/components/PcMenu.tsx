import { Briefcase, ChevronDown, House, Laptop, Monitor, PcCase, Server, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { PC_ICONS, type PcChoice, type PcIcon } from "../../../shared/types";
import { useLoad } from "../hooks";
import { pcBridge as switcher } from "../pcBridge";
import { isConnected, useStore } from "../store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const ICONS: Record<PcIcon, { Icon: LucideIcon; label: string }> = {
  monitor: { Icon: Monitor, label: "Monitor" },
  laptop: { Icon: Laptop, label: "Laptop" },
  "pc-case": { Icon: PcCase, label: "Tower" },
  server: { Icon: Server, label: "Server" },
  house: { Icon: House, label: "Home" },
  briefcase: { Icon: Briefcase, label: "Work" },
};

function PcGlyph({ icon, className }: { icon?: PcIcon; className?: string }) {
  const { Icon } = ICONS[icon ?? "monitor"] ?? ICONS.monitor;
  return <Icon className={className} />;
}

function useHostStatus() {
  const connected = useStore(isConnected);
  const busy = useStore((s) => Object.values(s.statuses).filter((b) => b.state === "thinking" || b.state === "working").length);
  if (!connected) return { connected, text: "Reconnecting…" };
  return { connected, text: busy ? `${busy} bot${busy > 1 ? "s" : ""} working` : "All quiet" };
}

export function PcMenu() {
  const hostname = useStore((s) => s.hostname);
  const status = useHostStatus();
  const saved = useLoad(() => switcher?.list() ?? Promise.resolve(null), []);
  const pcs: PcChoice[] = saved.data ?? [{ id: "current", name: hostname ?? "…", current: true }];
  const current = pcs.find((pc) => pc.current);
  const name = current?.name ?? hostname ?? "…";

  const switchTo = async (id: string) => {
    const problem = await switcher?.open(id);
    if (problem) toast.error(problem);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 min-w-0 max-w-44 shrink justify-start gap-2 rounded-full px-2.5 md:max-w-48" aria-label={`PC ${name}`} title={name}>
          <PcGlyph icon={current?.icon} className="size-4" />
          <span className="pc-name truncate font-semibold">{name}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
          <i className={cn("size-1.5 rounded-full", status.connected ? "bg-working" : "bg-muted-foreground")} />
          {status.text}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current?.id} onValueChange={switchTo}>
          {pcs.map((pc) => (
            <DropdownMenuRadioItem key={pc.id} value={pc.id}>
              <PcGlyph icon={pc.icon} />
              <span className="truncate">{pc.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {switcher && current && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PcGlyph icon={current.icon} /> Change icon
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={current.icon ?? "monitor"} onValueChange={(icon) => switcher?.setIcon(current.id, icon as PcIcon).then(saved.reload)}>
                  {PC_ICONS.map((icon) => (
                    <DropdownMenuRadioItem key={icon} value={icon}>
                      <PcGlyph icon={icon} /> {ICONS[icon].label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={() => void switcher?.manage()}>Manage PCs…</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
