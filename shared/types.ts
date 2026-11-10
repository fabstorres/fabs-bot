
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
  /** Short optional tag shown next to the name, e.g. "Executive Assistant". */
  label: string;
  role: string;
  instructions: string;
  shape: Shape;
  color: string;
  provider: ProviderId;
  model: string;
  cwd: string;
  autonomy: Autonomy;
  connectorIds: string[];
  isTeamLead: boolean;
  createdAt: number;
}

export type BotState = "idle" | "thinking" | "working" | "waiting" | "blocked" | "done" | "error";

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
      /** A new bot's opening question. It invites an answer but doesn't flag the thread as needing you. */
      greeting?: boolean;
    }
  | {
      type: "approval";
      requestId: string;
      tool: string;
      summary: string;
      decision?: "allow" | "deny";
    }
  | { type: "screen"; botId: string; reason: string; outcome?: ScreenOutcome }
  | { type: "webhook"; requestId: string; state: "sending" | "received" | "failed"; detail: string }
  | { type: "webhook-setup" };

export type ScreenOutcome = "done" | "skipped" | "closed";

export type WebhookEncoding = "hex" | "base64";

export interface WebhookSettings {
  configured: boolean;
  signing: { enabled: boolean; header: string; encoding: WebhookEncoding; prefix: string };
}

export interface ScreenState {
  botId: string;
  status: "closed" | "loading" | "live";
  url: string;
  title: string;
  controller: "bot" | "user";
  activeAt: number;
  updatedAt: number;
}

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

export const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface ProviderSettings {
  enabled: boolean;
  displayName: string;
  binaryPath: string;
  launchArgs: string;
  defaultModel: string;
  env: Record<string, string>;
}

export interface ModelOption {
  id: string;
  name: string;
  legacy?: boolean;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  bin: string;
  path: string | null;
  installed: boolean;
  version: string;
  supportsTools: boolean;
  note: string;
  models: ModelOption[];
  settings: ProviderSettings;
  checkedAt: number;
}

export interface HostInfo {
  hostname: string;
  version: string;
  port: number;
  tailscale: {
    running: boolean;
    ip: string | null;
    dnsName: string | null;
    login: string | null;
    peers: { name: string; os: string; online: boolean; ip: string }[];
    serveUrl: string | null;
  };
  /** Tailscale HTTPS: `tailscale serve` on its own port, turned on from the This PC panel. */
  serve: {
    enabled: boolean;
    port: number;
    problem: "not-installed" | "not-logged-in" | "permission-denied" | "port-taken" | "target-busy" | "failed" | null;
  };
  workRoot: string;
}

export interface Device {
  id: string;
  label: string;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}

export interface PairingLink {
  url: string;
  expiresAt: number;
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
  | { type: "hello"; bots: Bot[]; statuses: BotStatus[]; threads: Thread[]; links: Link[]; screens: ScreenState[]; chromium: boolean }
  | { type: "bot"; bot: Bot }
  | { type: "bot.deleted"; botId: string }
  | { type: "status"; status: BotStatus }
  | { type: "thread"; thread: Thread }
  | { type: "thread.deleted"; threadId: string }
  | { type: "thread.open"; threadId: string; fromThreadId: string }
  | { type: "message"; message: Message }
  | { type: "message.deleted"; threadId: string; messageId: string }
  | { type: "link.start"; link: Link }
  | { type: "link.end"; linkId: string }
  | { type: "devices" }
  | { type: "screen"; screen: ScreenState }
  | { type: "heartbeat"; everyMs: number };

export const PC_ICONS = ["monitor", "laptop", "pc-case", "server", "house", "briefcase"] as const;
export type PcIcon = (typeof PC_ICONS)[number];

/** A PC the desktop app can open: a name and the web origin its Fabs Bot answers on. */
export interface SavedPc {
  id: string;
  name: string;
  origin: string;
  icon?: PcIcon;
}

export interface DesktopState {
  pcs: SavedPc[];
  /** `"local"` for this PC, a saved PC's id, or null before the first connection. */
  last: string | null;
  localIcon?: PcIcon;
}

/** What the desktop launcher may ask the Electron app. Calls that can fail resolve to an error message, or null. */
export interface DesktopBridge {
  state(): Promise<DesktopState>;
  open(id: string): Promise<string | null>;
  add(link: string, name: string): Promise<string | null>;
  remove(id: string): Promise<void>;
}

export interface PcChoice {
  id: string;
  name: string;
  icon?: PcIcon;
  current: boolean;
}

export interface PcSwitcher {
  list(): Promise<PcChoice[]>;
  open(id: string): Promise<string | null>;
  setIcon(id: string, icon: PcIcon): Promise<void>;
  manage(): Promise<void>;
  titleBar?: string;
  windowControls?: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    onMaximizedChange(listener: (maximized: boolean) => void): () => void;
  };
}

export type LimitsProviderId = Extract<ProviderId, "claude" | "codex">;

export interface UsageWindow {
  id: string;
  label: string;
  usedPercent: number;
  resetsAt?: number;
  durationMins?: number;
}

export interface ProviderLimits {
  provider: LimitsProviderId;
  status: "ok" | "not-installed" | "unavailable" | "error";
  plan?: string;
  checkedAt: number;
  windows: UsageWindow[];
  credits?: string;
  resetCredits?: { available: number; nextExpiresAt?: number };
  error?: string;
}
