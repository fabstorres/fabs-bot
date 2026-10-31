import type { Bot } from "../../../shared/types";
import { BotAvatar } from "./BotAvatar";
import { Badge } from "@/components/ui/badge";

export function MentionChip({ bot, onClick }: { bot: Bot; onClick?: () => void }) {
  const style = {
    color: `color-mix(in oklab, ${bot.color} 65%, currentColor)`,
    backgroundColor: `color-mix(in oklab, ${bot.color} 16%, transparent)`,
  };
  const className = "inline px-1.5 py-0.5 text-[1em] font-semibold";
  const body = (
    <>
      <BotAvatar shape={bot.shape} color={bot.color} size={16} className="mr-1 align-[-0.2em]" />
      {bot.name}
    </>
  );
  if (!onClick) {
    return (
      <Badge variant="ghost" className={className} style={style} data-mention={bot.id}>
        {body}
      </Badge>
    );
  }
  return (
    <Badge asChild variant="ghost" className={`${className} cursor-pointer hover:opacity-80`} style={style} data-mention={bot.id}>
      <button type="button" aria-label={`@${bot.name}`} title={`Open ${bot.name}`} onClick={onClick}>
        {body}
      </button>
    </Badge>
  );
}
