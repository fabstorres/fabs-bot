import type { Bot, Connector, ModelOption } from "../../shared/types";

export type RunConnector = Connector & { tokenEnv?: string };

export const serverKey = (c: Connector) => c.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");

/** Normalized events every CLI adapter emits. `text` appends to the current text part; `text.break` starts a new bubble. */
export type ProviderEvent =
  | { type: "session"; id: string }
  | { type: "text"; text: string }
  | { type: "text.break" }
  | { type: "tool.start"; id: string; name: string; summary: string }
  | { type: "tool.end"; id: string; error?: boolean; summary?: string }
  | { type: "error"; message: string }
  | { type: "done"; costUsd?: number };

export interface Launch {
  bin: string;
  args: string[];
  env: Record<string, string>;
}

export interface RunOptions {
  bot: Bot;
  launch: Launch;
  prompt: string;
  systemPrompt: string;
  sessionId: string | null;
  cwd: string;
  /** Our MCP endpoint for this turn (bot ↔ app ↔ other bots). */
  mcpUrl: string;
  connectors: RunConnector[];
  addDirs: string[];
  signal: AbortSignal;
}

export interface Provider {
  id: Bot["provider"];
  label: string;
  bin: string;
  /** Whether the adapter can give the agent our MCP tools (message other bots, ask you, share files…). */
  supportsTools: boolean;
  /** Whether the CLI keeps its own session, so we only send new messages on later turns. */
  resumable: boolean;
  note: string;
  models: ModelOption[];
  run(opts: RunOptions, emit: (e: ProviderEvent) => void): Promise<void>;
}
