import { StrictMode, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Trash2 } from "lucide-react";
import "@fontsource-variable/figtree";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import type { DesktopBridge } from "../../shared/types";
import { useLoad } from "./hooks";
import { BotAvatar } from "./components/BotAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const desktop = (window as unknown as { fabsDesktop: DesktopBridge }).fabsDesktop;

function PcRow({ name, detail, address, busy, onOpen, onForget }: { name: string; detail: string; address?: boolean; busy: boolean; onOpen: () => void; onForget?: () => void }) {
  return (
    <div role="group" aria-label={`PC ${name}`} className="flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <b className="truncate">{name}</b>
        <span className={cn("truncate text-xs text-muted-foreground", address && "mono-box font-mono")}>{detail}</span>
      </div>
      {onForget && (
        <Button variant="ghost" size="icon" aria-label={`Forget ${name}`}
          onClick={(e) => {
            const row = e.currentTarget.closest("[role=group]");
            (row?.nextElementSibling ?? row?.previousElementSibling)?.querySelector("button")?.focus();
            onForget();
          }}
        >
          <Trash2 />
        </Button>
      )}
      <Button className="rounded-full" disabled={busy} onClick={onOpen}>
        {busy ? "Opening…" : "Open"}
      </Button>
    </div>
  );
}

function Launcher() {
  const { data, reload } = useLoad(() => desktop.state(), []);
  const [error, setError] = useState(() => new URLSearchParams(location.search).get("error"));
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [name, setName] = useState("");

  const run = async (key: string, action: () => Promise<string | null | void>) => {
    setBusy(key);
    setError(null);
    const problem = await action();
    setBusy(null);
    if (problem) setError(problem);
    reload();
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    void run("add", () => desktop.add(link, name));
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-10">
      <header className="flex items-center gap-3">
        <BotAvatar shape="blob" color="#111111" size={44} />
        <div>
          <h1 className="text-xl font-semibold">Fabs Bot</h1>
          <p className="text-sm text-muted-foreground">Pick the PC your bots live on.</p>
        </div>
      </header>

      <section aria-label="PCs" className="flex flex-col divide-y rounded-2xl border">
        <PcRow name="This PC" detail="Bots running on this computer" busy={busy === "local"} onOpen={() => run("local", () => desktop.open("local"))} />
        {data?.pcs.map((pc) => (
          <PcRow
            key={pc.id}
            name={pc.name}
            detail={pc.origin}
            address
            busy={busy === pc.id}
            onOpen={() => run(pc.id, () => desktop.open(pc.id))}
            onForget={() => run(`forget-${pc.id}`, () => desktop.remove(pc.id))}
          />
        ))}
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <form aria-label="Add a PC" className="flex flex-col gap-3 rounded-2xl border p-4" onSubmit={add}>
        <h2 className="font-semibold">Add a PC</h2>
        <p className="text-sm text-muted-foreground">
          On the other PC, open This PC and copy the pairing link. If it has Tailscale HTTPS on, its https address works without pairing.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pc-link">Pairing link or address</Label>
          <Input id="pc-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste the link from the other PC" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pc-name">Name (optional)</Label>
          <Input id="pc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Fedora" />
        </div>
        <Button type="submit" className="self-start rounded-full" disabled={busy === "add" || !link.trim()}>
          {busy === "add" ? "Connecting…" : "Connect"}
        </Button>
      </form>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Launcher />
  </StrictMode>,
);
