import { Monitor, Palette, Plug, SquareTerminal } from "lucide-react";
import { closeSettings, openSettingsSection, type SettingsSection } from "../store";
import { setTheme, useTheme, type Theme } from "../theme";
import { PluginsSettings, ThisPcSettings } from "./Panels";
import { ProvidersSettings } from "./Providers";
import { SectionDialog, type DialogSection } from "./SectionDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SECTIONS: DialogSection<SettingsSection>[] = [
  { id: "providers", label: "Providers", Icon: SquareTerminal, keywords: "agent cli claude codex cursor opencode gemini binary path launch arguments environment variables models" },
  { id: "plugins", label: "Plugins", Icon: Plug, keywords: "mcp servers connectors notion google drive github browser" },
  { id: "pc", label: "This PC", Icon: Monitor, keywords: "pair device phone laptop qr code paired devices tailscale https version desks folder" },
  { id: "appearance", label: "Appearance", Icon: Palette, keywords: "theme dark mode light mode system colors" },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function SettingsDialog({ section }: { section?: SettingsSection }) {
  return (
    <SectionDialog title="Settings" description="Manage providers, plugins, this PC, and appearance." sections={SECTIONS} section={section} onSection={openSettingsSection} onClose={closeSettings}>
      {section === "providers" && <ProvidersSettings />}
      {section === "plugins" && <PluginsSettings />}
      {section === "pc" && <ThisPcSettings />}
      {section === "appearance" && <AppearanceSettings />}
    </SectionDialog>
  );
}

function AppearanceSettings() {
  const theme = useTheme((s) => s.theme);
  return (
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
  );
}
