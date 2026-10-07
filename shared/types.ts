
export type ProviderId = "claude" | "codex" | "cursor" | "opencode" | "gemini";

export type Shape =
  | "blob"
  | "cloud"
  | "drop"
  | "hex"
  | "square"
  | "egg"
  | "pill"
  | "triangle"
  | "flower"
  | "bean";

/** full = never ask (bypass permissions). ask = route risky tool calls to you for approval. */
export type Autonomy = "full" | "ask";

export interface Bot {
  id: string;
  name: string;
  role: string;
  instructions: string;
  shape: Shape;
  color: string;
  provider: ProviderId;
  model: string;
  cwd: string;
  autonomy: Autonomy;
  connectorIds: string[];
  createdAt: number;
}

export type BotState = "idle" | "working" | "waiting" | "error";

export interface BotStatus {
  botId: string;
  state: BotState;
  text: string;
  threadId: string | null;
  updatedAt: number;
}

export type ThreadKind = "direct" | "group" | "backchannel";

export interface Thread {
  id: string;
  title: string;
  topic: string;
  kind: ThreadKind;
  memberIds: string[];
  createdAt: number;
  updatedAt: number;
  preview: string;
  unread: number;
  /** An unanswered question or approval is waiting on the user. */
  needsYou: boolean;
}

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "tool"; id: string; name: string; summary: string; status: "running" | "done" | "error" }
  | { type: "file"; fileId: string; name: string; size: number }
  | {
      type: "question";
      question: string;
      options: string[];
      /** Index of the tapped option, or -1 when the user answered by typing. */
      answered?: number;
    }
  | {
      type: "approval";
      requestId: string;
      tool: string;
      summary: string;
      decision?: "allow" | "deny";
    };

export interface Message {
  id: string;
  threadId: string;
  seq: number;
  author: "user" | "bot" | "system";
  botId: string | null;
  /** When a bot speaks on behalf of another bot (backchannel), who addressed it. */
  fromBotId: string | null;
  parts: MessagePart[];
  status: "streaming" | "done" | "error";
  createdAt: number;
}

export interface Routine {
  id: string;
  botId: string;
  name: string;
  cron: string;
  prompt: string;
  threadId: string | null;
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
}

export type ConnectorKind = "stdio" | "http";

export interface Connector {
  id: string;
  name: string;
  preset: string;
  kind: ConnectorKind;
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
  createdAt: number;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  installed: boolean;
  version: string;
  supportsTools: boolean;
  note: string;
  models: string[];
}

export interface HostInfo {
  hostname: string;
  port: number;
  tailscale: {
    running: boolean;
    ip: string | null;
    dnsName: string | null;
    login: string | null;
    peers: { name: string; os: string; online: boolean; ip: string }[];
    serveUrl: string | null;
  };
  pairUrl: string | null;
  workRoot: string;
}

/** Live link between two bots (one bot messaging another). */
export interface Link {
  id: string;
  fromBotId: string;
  toBotId: string;
  threadId: string;
  startedAt: number;
}

export type ServerEvent =
  | { type: "hello"; bots: Bot[]; statuses: BotStatus[]; threads: Thread[]; links: Link[] }
  | { type: "bot"; bot: Bot }
  | { type: "bot.deleted"; botId: string }
  | { type: "status"; status: BotStatus }
  | { type: "thread"; thread: Thread }
  | { type: "thread.deleted"; threadId: string }
  | { type: "message"; message: Message }
  | { type: "link.start"; link: Link }
  | { type: "link.end"; linkId: string };
