import { type Ref, useId, useImperativeHandle, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Mention from "@tiptap/extension-mention";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Fragment, Slice } from "@tiptap/pm/model";
import { EditorContent, type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import type { SuggestionProps } from "@tiptap/suggestion";
import { DELETED_BOT, handleOf, mentionOf, splitMarkdownMentions } from "../../../shared/mentions";
import type { Bot } from "../../../shared/types";
import { useStore } from "../store";
import { BotAvatar } from "./BotAvatar";
import { MentionChip } from "./MentionChip";
import { cn } from "@/lib/utils";

export interface MentionInputHandle {
  setText(text: string): void;
  getText(): string;
}

interface Props {
  ref?: Ref<MentionInputHandle>;
  value: string;
  onChange(v: string): void;
  onSubmit(text: string): void;
  bots: Bot[];
  placeholder: string;
  ariaLabel: string;
  autoFocus?: boolean;
  onPasteFiles?: (files: FileList) => void;
}

interface Suggest {
  query: string;
  pick(bot: Bot): void;
}

const toLines = (text: string): JSONContent[] =>
  text.split(/\r?\n/).flatMap((line, i) => [...(i ? [{ type: "hardBreak" }] : []), ...(line ? [{ type: "text", text: line }] : [])]);

function toContent(text: string, bots: Bot[]): JSONContent[] {
  return splitMarkdownMentions(text, bots).flatMap((p) => (typeof p === "string" ? toLines(p) : [{ type: "mention", attrs: { id: p.bot.id, label: p.bot.name } }]));
}

const toDoc = (text: string, bots: Bot[]): JSONContent => ({ type: "doc", content: [{ type: "paragraph", content: toContent(text, bots) }] });

function ComposerChip({ node }: NodeViewProps) {
  const bot = useStore((s) => s.bots.find((b) => b.id === node.attrs.id));
  return <NodeViewWrapper as="span">{bot ? <MentionChip bot={bot} /> : DELETED_BOT}</NodeViewWrapper>;
}

const BotMention = Mention.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ComposerChip);
  },
});

export function MentionInput({ ref, value, onChange, onSubmit, bots, placeholder, ariaLabel, autoFocus, onPasteFiles }: Props) {
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const [active, setActive] = useState(0);
  const listId = useId();
  const optionId = (i: number) => `${listId}-${i}`;

  const matches = suggest ? bots.filter((b) => handleOf(b.name).toLowerCase().startsWith(suggest.query.toLowerCase())).slice(0, 6) : [];

  function show({ query, command }: SuggestionProps) {
    setSuggest({ query, pick: (b) => command({ id: b.id, label: b.name }) });
    setActive(0);
  }

  function keyDown(e: KeyboardEvent): boolean {
    if (suggest && matches.length) {
      if (e.key === "ArrowDown") setActive((active + 1) % matches.length);
      else if (e.key === "ArrowUp") setActive((active - 1 + matches.length) % matches.length);
      else if (e.key === "Enter" || e.key === "Tab") suggest.pick(matches[active]!);
      else return false;
      return true;
    }
    if (e.key !== "Enter" || e.shiftKey || e.isComposing) return false;
    onSubmit(editor.getText({ blockSeparator: "\n" }));
    return true;
  }

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      BotMention.configure({
        deleteTriggerWithBackspace: true,
        renderText: ({ node }) => mentionOf(node.attrs as { id: string }),
        suggestion: { render: () => ({ onStart: show, onUpdate: show, onExit: () => setSuggest(null) }) },
      }),
    ],
    content: toDoc(value, bots),
    autofocus: autoFocus ? "end" : false,
    onUpdate: ({ editor }) => onChange(editor.getText({ blockSeparator: "\n" })),
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        "aria-placeholder": placeholder,
        "aria-autocomplete": "list",
        ...(matches.length > 0 && { "aria-controls": listId, "aria-activedescendant": optionId(active) }),
        class: "px-2 py-[7px] text-base leading-snug wrap-anywhere outline-none",
      },
      handleKeyDown: (_view, e) => keyDown(e),
      handlePaste: (view, e) => {
        const files = e.clipboardData?.files;
        if (files?.length) {
          onPasteFiles?.(files);
          return true;
        }
        const text = e.clipboardData?.getData("text/plain");
        if (!text) return false;
        view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.fromJSON(view.state.schema, toContent(text, bots)), 0, 0)).scrollIntoView());
        return true;
      },
    },
  });

  useImperativeHandle(ref, () => ({
    setText: (text) => editor.commands.setContent(toDoc(text, bots), { emitUpdate: false }),
    getText: () => editor.getText({ blockSeparator: "\n" }),
  }));

  return (
    <div className="relative min-w-0 flex-1">
      {matches.length > 0 && (
        <div
          className="absolute bottom-[calc(100%+14px)] left-0 z-50 w-72 max-w-full rounded-2xl border bg-popover p-1.5 shadow-lg animate-in fade-in-0 zoom-in-95"
          id={listId}
          role="listbox"
          aria-label="Mention a bot"
        >
          {matches.map((b, i) => (
            <button
              key={b.id}
              id={optionId(i)}
              type="button"
              role="option"
              aria-selected={i === active}
              aria-label={b.name}
              className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left", i === active && "bg-accent")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => suggest?.pick(b)}
            >
              <BotAvatar shape={b.shape} color={b.color} size={24} />
              <span className="font-semibold whitespace-nowrap">{b.name}</span>
              <span className="truncate text-xs text-muted-foreground">{b.role}</span>
            </button>
          ))}
        </div>
      )}
      <div className="relative max-h-60 overflow-y-auto">
        {!value && (
          <span aria-hidden className="pointer-events-none absolute inset-x-2 top-[7px] truncate text-base leading-snug text-muted-foreground">
            {placeholder}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
