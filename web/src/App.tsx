import type { ReactNode } from "react";
import { useWindowEvent } from "./hooks";
import { backToDesk, offlineReason, offlineTitle, reconnect, restoreView, showOffline, useStore } from "./store";
import { BotAvatar } from "./components/BotAvatar";
import { BotEditor } from "./components/BotEditor";
import { Chat } from "./components/Chat";
import { DeskPanel } from "./components/DeskPanel";
import { NewBot } from "./components/NewBot";
import { LimitsDialog } from "./components/Limits";
import { FileViewer } from "./components/Panels";
import { ScreenView } from "./components/Screen";
import { SettingsDialog } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function App() {
  const loaded = useStore((s) => s.loaded);
  const unpaired = useStore((s) => s.unpaired);
  const offline = useStore(showOffline);
  const offlineText = useStore(offlineTitle);
  const reason = useStore(offlineReason);
  const noBots = useStore((s) => s.bots.length === 0);
  const creating = useStore((s) => s.creating) || noBots;
  const panelOpen = useStore((s) => s.panelOpen);
  const thread = useStore((s) => s.threads.find((t) => t.id === s.openThreadId));
  const screenBot = useStore((s) => (s.screen && thread?.memberIds.includes(s.screen.botId) ? s.bots.find((b) => b.id === s.screen!.botId) : undefined));
  const modal = useStore((s) => s.modal);
  const settings = useStore((s) => s.settings);
  const limitsOpen = useStore((s) => s.limitsOpen);

  useWindowEvent("popstate", restoreView);

  if (unpaired) return <Notice shape="square" color="#7A7A7A" state="waiting" title="Not paired yet">On your PC, open Fabs Bot → tap Settings at the top of the sidebar → This PC → Pair a device, then scan the QR code with this device. Both need to be on your Tailscale network.</Notice>;
  if (!loaded && offline)
    return (
      <Notice
        shape="drop"
        color="#FF5A00"
        state="error"
        title={offlineText}
        action={
          <Button variant="outline" className="rounded-full" onClick={reconnect}>
            Reconnect
          </Button>
        }
      >
        {reason}
      </Notice>
    );
  if (!loaded)
    return (
      <div className="grid h-dvh place-items-center">
        <BotAvatar shape="drop" color="#FF5A00" size={64} state="thinking" />
      </div>
    );

  const showMain = creating || !!thread;
  return (
    <div className="flex h-dvh">
      <div className={cn("h-full w-full md:block md:w-auto", showMain && "hidden")}>
        <Sidebar />
      </div>
      <main className={cn("h-full min-w-0 flex-1 md:flex", showMain ? "flex" : "hidden")}>
        {creating ? (
          <NewBot />
        ) : thread && screenBot ? (
          <>
            <ScreenView key={`screen-${screenBot.id}`} bot={screenBot} thread={thread} onBack={backToDesk} />
            <Chat key={`chat-${thread.id}`} thread={thread} side />
          </>
        ) : thread ? (
          <>
            <Chat key={`chat-${thread.id}`} thread={thread} />
            {panelOpen && <DeskPanel key={`desk-${thread.id}`} thread={thread} />}
          </>
        ) : (
          <Empty />
        )}
      </main>
      {settings && <SettingsDialog section={settings.section} />}
      {limitsOpen && <LimitsDialog />}
      {modal?.kind === "bot" && <BotEditor botId={modal.botId} />}
      {modal?.kind === "file" && <FileViewer url={modal.url} name={modal.name} />}
    </div>
  );
}

function Empty() {
  const bots = useStore((s) => s.bots);
  return (
    <div className="m-auto flex flex-col items-center gap-4 text-center">
      <div className="flex -space-x-3">
        {bots.slice(0, 4).map((b) => (
          <BotAvatar key={b.id} shape={b.shape} color={b.color} size={56} />
        ))}
      </div>
      <p className="text-muted-foreground">Pick a bot to chat with.</p>
    </div>
  );
}

function Notice({ title, children, action, ...avatar }: { title: string; children: ReactNode; action?: ReactNode } & Parameters<typeof BotAvatar>[0]) {
  return (
    <div className="grid h-dvh place-items-center px-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <BotAvatar {...avatar} size={112} />
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{children}</p>
        {action}
      </div>
    </div>
  );
}
