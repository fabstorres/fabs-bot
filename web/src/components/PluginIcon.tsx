import { Server } from "lucide-react";
import github from "@/assets/plugins/github.svg";
import gmail from "@/assets/plugins/gmail.svg";
import googleCalendar from "@/assets/plugins/google-calendar.svg";
import googleDocs from "@/assets/plugins/google-docs.svg";
import googleDrive from "@/assets/plugins/google-drive.svg";
import notion from "@/assets/plugins/notion.svg";
import playwright from "@/assets/plugins/playwright.svg";
import { cn } from "@/lib/utils";

const LOGOS = [
  { key: "notion", src: notion, match: /notion/ },
  { key: "gdrive", src: googleDrive, match: /gdrive|google drive/ },
  { key: "gmail", src: gmail, match: /gmail/ },
  { key: "gcal", src: googleCalendar, match: /google calendar/ },
  { key: "gdocs", src: googleDocs, match: /google docs/ },
  { key: "github", src: github, match: /github/ },
  { key: "playwright", src: playwright, match: /playwright/ },
];

export function pluginLogo(name: string) {
  const text = name.toLowerCase();
  return LOGOS.find((l) => l.match.test(text))?.key;
}

export function PluginIcon({ logo, className }: { logo?: string; className?: string }) {
  const src = LOGOS.find((l) => l.key === logo)?.src;
  return (
    <span className={cn("flex size-8 flex-none items-center justify-center rounded-lg border bg-background", className)}>
      {src ? (
        <img src={src} alt="" className={cn("size-[18px] object-contain", logo === "github" && "dark:invert")} />
      ) : (
        <Server className="size-4 text-muted-foreground" />
      )}
    </span>
  );
}
