import { useState } from "react";
import type { ModelOption } from "../../../shared/types";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";

const CLI_DEFAULT = "cli-default";
const CUSTOM = "custom";

export function ModelPicker({ id, label, models, value, onChange }: { id?: string; label: string; models: ModelOption[]; value: string; onChange(model: string): void }) {
  const [custom, setCustom] = useState(() => value !== "" && !models.some((m) => m.id === value));
  const [text, setText] = useState(custom ? value : "");
  const recent = models.filter((m) => !m.legacy);
  const legacy = models.filter((m) => m.legacy);
  const pick = (choice: string) => {
    setCustom(choice === CUSTOM);
    if (choice === CUSTOM) return setText(value);
    onChange(choice === CLI_DEFAULT ? "" : choice);
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <Select value={custom ? CUSTOM : value || CLI_DEFAULT} onValueChange={pick}>
        <SelectTrigger id={id} aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={CLI_DEFAULT}>CLI default</SelectItem>
          {recent.length > 0 && (
            <SelectGroup>
              <SelectLabel>Recent</SelectLabel>
              {recent.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {legacy.length > 0 && (
            <SelectGroup>
              <SelectLabel>Legacy</SelectLabel>
              {legacy.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          <SelectSeparator />
          <SelectItem value={CUSTOM}>Custom model…</SelectItem>
        </SelectContent>
      </Select>
      {custom && (
        <Input
          aria-label={`${label} ID`}
          placeholder="Model ID"
          className="font-mono"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text.trim() !== value && onChange(text.trim())}
        />
      )}
    </div>
  );
}
