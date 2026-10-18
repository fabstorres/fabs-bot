import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { Bot, Shape } from "../../../shared/types";
import { BOT_TEMPLATES, COLORS, SHAPES, type BotTemplate } from "../../../shared/templates";
import { api } from "../api";
import { goBack, openDirect, useStore } from "../store";
import { BotAvatar } from "./BotAvatar";
import { blankBot } from "./BotEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { onRadioGroupKeyDown, radioTabIndex } from "@/lib/radio";
import { cn } from "@/lib/utils";

/** Pick a face and a name; everything else can be tuned later from the bot's settings. */
export function NewBot() {
  const hasBots = useStore((s) => s.bots.length > 0);
  const [template, setTemplate] = useState<BotTemplate | null>(null);
  const [name, setName] = useState("");
  const [shape, setShape] = useState<Shape>("blob");
  const [color, setColor] = useState("#1478FF");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function suggest(t: BotTemplate) {
    setTemplate(t);
    setName(t.name);
    setShape(t.shape);
    setColor(t.color);
  }

  async function create() {
    setBusy(true);
    try {
      const bot = await api.post<Bot>("/api/bots", { ...blankBot, ...template, name: name.trim(), shape, color });
      await openDirect(bot.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background" role="region" aria-label="New bot">
      <header className="flex h-14 flex-none items-center gap-2 px-3 md:px-5">
        {hasBots && (
          <Button variant="ghost" size="icon" className="rounded-full md:hidden" onClick={goBack} aria-label="Back">
            <ChevronLeft className="size-5" />
          </Button>
        )}
        <BotAvatar shape={shape} color={color} size={28} />
        <span className="text-[17px] font-semibold">{name.trim() || "New Bot"}</span>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-10">
        <form
          className="mx-auto flex max-w-lg flex-col items-center gap-6 pt-6 md:pt-14"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void create();
          }}
        >
          <BotAvatar shape={shape} color={color} size={120} className="animate-in zoom-in-90" key={shape} />
          <div className="flex flex-wrap justify-center gap-2.5" role="radiogroup" aria-label="Color" onKeyDown={onRadioGroupKeyDown}>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                tabIndex={radioTabIndex(c, color, COLORS)}
                aria-label={c}
                className={cn("size-8 rounded-full ring-offset-2 transition-transform hover:scale-110", color === c && "ring-2 ring-(--ring-color)")}
                style={{ background: c, ["--ring-color" as string]: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Shape" onKeyDown={onRadioGroupKeyDown}>
            {SHAPES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={shape === s}
                tabIndex={radioTabIndex(s, shape, SHAPES)}
                aria-label={s}
                className={cn("rounded-xl border-2 border-transparent p-1 hover:bg-muted", shape === s && "border-foreground/80")}
                onClick={() => setShape(s)}
              >
                <BotAvatar shape={s} color={color} size={30} />
              </button>
            ))}
          </div>
          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="new-bot-name" className="text-muted-foreground">
              Name
            </Label>
            <Input
              id="new-bot-name"
              aria-label="Name"
              value={name}
              placeholder="New Bot"
              className="h-11 rounded-xl text-base"
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-failing">{error}</p>}
          <Button type="submit" size="lg" className="rounded-full px-8" disabled={!name.trim() || busy}>
            Get started
          </Button>
        </form>

        <div className="mx-auto mt-14 max-w-3xl">
          <h2 className="mb-3 text-sm text-muted-foreground">Suggestions</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {BOT_TEMPLATES.map((t) => (
              <button
                key={t.key}
                className={cn(
                  "flex items-center gap-4 rounded-3xl border bg-background p-5 text-left transition-colors hover:bg-muted/60",
                  template?.key === t.key && "border-foreground/40 bg-muted/60",
                )}
                aria-label={`Suggestion ${t.name}`}
                onClick={() => suggest(t)}
              >
                <BotAvatar shape={t.shape} color={t.color} size={52} />
                <span className="min-w-0">
                  <span className="block text-lg font-medium">{t.name}</span>
                  <span className="block text-muted-foreground">{t.role}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
