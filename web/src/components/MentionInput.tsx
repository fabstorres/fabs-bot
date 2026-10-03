import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Bot } from "../../../shared/types";
import { BotAvatar } from "./BotAvatar";

export interface MentionInputHandle {
  focus(): void;
  insert(text: string): void;
}

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
export const MentionInput = forwardRef<MentionInputHandle, Props>(function MentionInput(
  { value, onChange, onSubmit, bots, placeholder, ariaLabel, autoFocus, onPaste },
  ref,
) {
  const el = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  useImperativeHandle(ref, () => ({
    focus: () => el.current?.focus(),
    insert(text) {
      onChange(value + text);
      requestAnimationFrame(() => el.current?.focus());
    },
  }));

  useEffect(() => {
    const t = el.current;
    if (!t) return;
    t.style.height = "0px";
    t.style.height = Math.min(t.scrollHeight, 180) + "px";
  }, [value]);

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
    <div className="mention-input">
      {matches.length > 0 && (
        <div className="mention-menu" role="listbox" aria-label="Mention a bot">
          {matches.map((b, i) => (
            <button
              key={b.id}
              type="button"
              role="option"
              aria-selected={i === active}
              aria-label={b.name}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(b);
              }}
            >
              <BotAvatar shape={b.shape} color={b.color} size={24} />
              <span className="mention-name">{b.name}</span>
              <span className="mention-role">{b.role}</span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={el}
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        onPaste={onPaste}
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
  );
});

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
