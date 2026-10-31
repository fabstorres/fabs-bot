import { useState } from "react";
import { ChevronLeft, ChevronRight, Monitor, Plug, Search, SquareTerminal, X, type LucideIcon } from "lucide-react";
import { goBack, openSettingsSection, type SettingsSection } from "../store";
import { PluginsSettings, ThisPcSettings } from "./Panels";
import { ProvidersSettings } from "./Providers";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

const SECTIONS: { id: SettingsSection; label: string; Icon: LucideIcon; keywords: string }[] = [
  { id: "providers", label: "Providers", Icon: SquareTerminal, keywords: "agent cli claude codex cursor opencode gemini binary path launch arguments environment variables models" },
  { id: "plugins", label: "Plugins", Icon: Plug, keywords: "mcp servers connectors notion google drive github browser" },
  { id: "pc", label: "This PC", Icon: Monitor, keywords: "pair device phone laptop qr code paired devices tailscale https version desks folder" },
];

export function SettingsPage({ section }: { section?: SettingsSection }) {
  const [query, setQuery] = useState("");
  const words = query.trim().toLowerCase();
  const matches = SECTIONS.filter((s) => `${s.label} ${s.keywords}`.toLowerCase().includes(words));
  const shown = SECTIONS.find((s) => s.id === section);

  return (
    <div className="flex h-dvh">
      <nav
        aria-label="Settings sections"
        className={cn("h-full w-full flex-col bg-sidebar md:flex md:w-72 md:flex-none md:border-r md:border-sidebar-border", section ? "hidden" : "flex")}
      >
        <div className="flex items-center gap-1 px-4 pt-4 pb-2 md:pb-1">
          <Button variant="ghost" size="icon" className="rounded-full md:hidden" onClick={goBack} aria-label="Back">
            <ChevronLeft className="size-5" />
          </Button>
          <h1 id="settings-title" tabIndex={-1} className="flex-1 text-lg font-semibold tracking-tight outline-none md:sr-only">
            Settings
          </h1>
        </div>
        <InputGroup className="mx-3 mb-2 w-auto rounded-xl border-0 bg-black/5 shadow-none has-[[data-slot=input-group-control]:focus-visible]:bg-black/7">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput value={query} placeholder="Search" aria-label="Search settings" className="text-[15px]" onChange={(e) => setQuery(e.target.value)} />
        </InputGroup>
        <div className="flex flex-col gap-0.5 px-2">
          {matches.map(({ id, label, Icon }) => (
            <Button
              key={id}
              id={`settings-nav-${id}`}
              variant="ghost"
              aria-current={id === section ? "page" : undefined}
              className={cn("h-12 justify-start gap-3 rounded-xl px-3 text-[15px] font-normal hover:bg-sidebar-accent/60 md:h-10", id === section && "bg-sidebar-accent hover:bg-sidebar-accent")}
              onClick={() => openSettingsSection(id)}
            >
              <Icon className="size-[18px]" />
              <span className="flex-1 text-left">{label}</span>
              <ChevronRight className="text-muted-foreground md:hidden" />
            </Button>
          ))}
          {matches.length === 0 && <p className="mt-10 text-center text-sm text-muted-foreground">Nothing matches "{query}".</p>}
        </div>
      </nav>

      <div className={cn("h-full min-w-0 flex-1 flex-col md:flex", section ? "flex" : "hidden")}>
        <header className="flex h-14 flex-none items-center gap-2 border-b px-3 md:px-6">
          <Button variant="ghost" size="icon" className="rounded-full md:hidden" onClick={goBack} aria-label="Back">
            <ChevronLeft className="size-5" />
          </Button>
          <Breadcrumb className="min-w-0 flex-1">
            <BreadcrumbList className="text-[15px]">
              <BreadcrumbItem>Settings</BreadcrumbItem>
              {shown && (
                <>
                  <BreadcrumbSeparator>/</BreadcrumbSeparator>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-medium">{shown.label}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
          <Button variant="ghost" size="icon" className="hidden rounded-full md:inline-flex" onClick={goBack} aria-label="Close settings" title="Close settings">
            <X className="size-5" />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto">
          {shown && (
            <section aria-label={shown.label} className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">
              <h2 id="settings-section-title" tabIndex={-1} className="sr-only">
                {shown.label}
              </h2>
              {shown.id === "providers" && <ProvidersSettings />}
              {shown.id === "plugins" && <PluginsSettings />}
              {shown.id === "pc" && <ThisPcSettings />}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
