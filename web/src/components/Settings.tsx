import { useState } from "react";
import { ChevronLeft, ChevronRight, Monitor, Palette, Plug, Search, SquareTerminal, X, type LucideIcon } from "lucide-react";
import { closeSettings, openSettingsSection, type SettingsSection } from "../store";
import { setAccent, setTheme, useTheme, type Accent, type Theme } from "../theme";
import { COLORS } from "../../../shared/templates";
import { PluginsSettings, ThisPcSettings } from "./Panels";
import { ProvidersSettings } from "./Providers";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { onRadioGroupKeyDown, radioTabIndex } from "@/lib/radio";
import { cn } from "@/lib/utils";

const SECTIONS: { id: SettingsSection; label: string; Icon: LucideIcon; keywords: string }[] = [
  { id: "providers", label: "Providers", Icon: SquareTerminal, keywords: "agent cli claude codex cursor opencode gemini binary path launch arguments environment variables models" },
  { id: "plugins", label: "Plugins", Icon: Plug, keywords: "mcp servers connectors notion google drive github browser" },
  { id: "pc", label: "This PC", Icon: Monitor, keywords: "pair device phone laptop qr code paired devices tailscale https version desks folder" },
  { id: "appearance", label: "Appearance", Icon: Palette, keywords: "theme dark mode light mode system colors accent color bubbles" },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const ACCENTS: { value: Accent; label: string; swatch: string }[] = [
  { value: "neutral", label: "Neutral", swatch: "var(--bubble-user)" },
  { value: "bot", label: "Bot color", swatch: `conic-gradient(${COLORS.slice(0, 8).join(", ")}, ${COLORS[0]})` },
];

const ACCENT_VALUES = ACCENTS.map((a) => a.value);

export function SettingsDialog({ section }: { section?: SettingsSection }) {
  const [query, setQuery] = useState("");
  const words = query.trim().toLowerCase();
  const matches = SECTIONS.filter((s) => `${s.label} ${s.keywords}`.toLowerCase().includes(words));
  const shown = SECTIONS.find((s) => s.id === section);

  return (
    <Dialog open onOpenChange={(open) => !open && closeSettings()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(48rem,calc(100dvh-2rem))] max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-6xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById(section ? "settings-section-title" : "settings-title")?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById("open-settings")?.focus();
        }}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">Manage providers, plugins, this PC, and appearance.</DialogDescription>
        <nav
          aria-label="Settings sections"
          className={cn("h-full min-h-0 w-full overflow-y-auto flex-col bg-sidebar md:flex md:w-56 md:flex-none md:border-r md:border-sidebar-border", section ? "hidden" : "flex")}
        >
          <div className="flex h-14 flex-none items-center gap-1 px-4">
            <h1 id="settings-title" tabIndex={-1} className="flex-1 text-lg font-semibold tracking-tight outline-none">
              Settings
            </h1>
            <Button variant="ghost" size="icon" className="rounded-full md:hidden" onClick={closeSettings} aria-label="Close settings">
              <X className="size-5" />
            </Button>
          </div>
          <InputGroup className="mx-3 mb-2 w-auto rounded-xl border-0 bg-black/5 shadow-none has-[[data-slot=input-group-control]:focus-visible]:bg-black/7 dark:bg-input/40 dark:inset-ring dark:inset-ring-input dark:has-[[data-slot=input-group-control]:focus-visible]:bg-input/60">
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

        <div className={cn("h-full min-h-0 min-w-0 flex-1 flex-col md:flex", section ? "flex" : "hidden")}>
          <header className="flex h-14 flex-none items-center gap-2 border-b px-3 md:px-6">
            <Button variant="ghost" size="icon" className="rounded-full md:hidden" onClick={() => openSettingsSection()} aria-label="Back">
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
            <Button variant="ghost" size="icon" className="rounded-full" onClick={closeSettings} aria-label="Close settings" title="Close settings">
              <X className="size-5" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {shown && (
              <section aria-label={shown.label} className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">
                <h2 id="settings-section-title" tabIndex={-1} className="sr-only">
                  {shown.label}
                </h2>
                {shown.id === "providers" && <ProvidersSettings />}
                {shown.id === "plugins" && <PluginsSettings />}
                {shown.id === "pc" && <ThisPcSettings />}
                {shown.id === "appearance" && <AppearanceSettings />}
              </section>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AppearanceSettings() {
  const theme = useTheme((s) => s.theme);
  const accent = useTheme((s) => s.accent);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 rounded-2xl border p-4">
        <div className="flex flex-col">
          <span className="font-medium">Theme</span>
          <span className="text-sm text-muted-foreground">Saved on this device. System follows your device's light or dark setting.</span>
        </div>
        <Select value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          <SelectTrigger aria-label="Theme" className="w-32 flex-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THEMES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-2xl border p-4">
        <div className="flex flex-col">
          <span id="accent-color-label" className="font-medium">
            Accent color
          </span>
          <span className="text-sm text-muted-foreground">Saved on this device. Bot color paints your messages and the send button in each 1:1 chat with that bot's color.</span>
        </div>
        <div className="flex flex-none gap-3" role="radiogroup" aria-labelledby="accent-color-label" onKeyDown={onRadioGroupKeyDown}>
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              type="button"
              role="radio"
              aria-checked={accent === a.value}
              tabIndex={radioTabIndex(a.value, accent, ACCENT_VALUES)}
              className="flex w-16 flex-col items-center gap-1.5 rounded-xl py-1 text-xs text-muted-foreground aria-checked:text-foreground"
              onClick={() => setAccent(a.value)}
            >
              <span className={cn("size-8 rounded-full ring-offset-2 ring-offset-background", accent === a.value && "ring-2 ring-foreground")} style={{ background: a.swatch }} />
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
