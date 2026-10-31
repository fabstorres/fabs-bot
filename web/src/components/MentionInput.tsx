import { useRef, useState } from "react";
import type { Bot } from "../../../shared/types";
import { BotAvatar } from "./BotAvatar";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange(v: string): void;
  onSubmit(): void;
  bots: Bot[];
  placeholder: string;
  /** Accessible name; the placeholder changes with context, so it isn't a stable handle. */
  ariaLabel: string;
  autoFocus?: boolean;
  onPaste?: (e: React.ClipboardEvent) => void;
}

/** Auto-growing textarea with @mention autocomplete for bots. Enter sends, Shift+Enter breaks. */
export function MentionInput({ value, onChange, onSubmit, bots, placeholder, ariaLabel, autoFocus, onPaste }: Props) {
  const el = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const matches =
    query === null ? [] : bots.filter((b) => b.name.toLowerCase().replace(/\s+/g, "").startsWith(query.toLowerCase())).slice(0, 6);

  function detect(v: string, caret: number) {
    const m = v.slice(0, caret).match(/(?:^|\s)@([\w-]*)$/);
    setQuery(m ? m[1]! : null);
    setActive(0);
  }

  function pick(b: Bot) {
    const t = el.current!;
    const caret = t.selectionStart;
    const before = value.slice(0, caret).replace(/@([\w-]*)$/, `@${b.name.replace(/\s+/g, "")} `);
    const next = before + value.slice(caret);
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(before.length, before.length);
    });
  }

  return (
    <div className="relative min-w-0 flex-1">
      {matches.length > 0 && (
        <div
          className="absolute bottom-[calc(100%+14px)] left-0 z-50 w-72 max-w-full rounded-2xl border bg-popover p-1.5 shadow-lg animate-in fade-in-0 zoom-in-95"
          role="listbox"
          aria-label="Mention a bot"
        >
          {matches.map((b, i) => (
            <button
              key={b.id}
              type="button"
              role="option"
              aria-selected={i === active}
              aria-label={b.name}
              className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left", i === active && "bg-accent")}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(b);
              }}
            >
              <BotAvatar shape={b.shape} color={b.color} size={24} />
              <span className="font-semibold whitespace-nowrap">{b.name}</span>
              <span className="truncate text-xs text-muted-foreground">{b.role}</span>
            </button>
          ))}
        </div>
      )}
      <div
        className="grid after:invisible after:max-h-60 after:px-2 after:py-1 after:text-base after:leading-snug after:wrap-anywhere after:whitespace-pre-wrap after:content-[attr(data-value)_'_'] after:[grid-area:1/1]"
        data-value={value}
      >
        <textarea
          ref={el}
          rows={1}
          value={value}
          placeholder={placeholder}
          aria-label={ariaLabel}
          autoFocus={autoFocus}
          onPaste={onPaste}
          className="composer-scrollbar max-h-60 min-w-0 resize-none overflow-y-auto bg-transparent px-2 py-1 text-base leading-snug outline-none [grid-area:1/1] placeholder:text-muted-foreground"
          onChange={(e) => {
            onChange(e.target.value);
            detect(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={(e) => {
            if (matches.length) {
              if (e.key === "ArrowDown") return e.preventDefault(), setActive((active + 1) % matches.length);
              if (e.key === "ArrowUp") return e.preventDefault(), setActive((active - 1 + matches.length) % matches.length);
              if (e.key === "Enter" || e.key === "Tab") return e.preventDefault(), pick(matches[active]!);
              if (e.key === "Escape") return setQuery(null);
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
      </div>
    </div>
  );
}

/** Bots @mentioned in text, in order of first mention. */
export function mentionedBots(text: string, bots: Bot[]): Bot[] {
  const lower = text.toLowerCase();
  return bots
    .map((b) => {
      const keys = [b.name.toLowerCase(), b.name.toLowerCase().replace(/\s+/g, "")];
      const at = Math.min(...keys.map((k) => lower.indexOf("@" + k)).filter((i) => i >= 0), Infinity);
      return { b, at };
    })
    .filter((x) => x.at !== Infinity)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.b);
}
