import type { Connector, ProviderId, Shape } from "./types";

export interface BotTemplate {
  key: string;
  name: string;
  role: string;
  instructions: string;
  shape: Shape;
  color: string;
  provider: ProviderId;
}

export const BOT_TEMPLATES: BotTemplate[] = [
  {
    key: "chief",
    name: "Chief of Staff",
    role: "Reads tomorrow's calendar, preps a morning digest",
    instructions:
      "Each evening or on request, review what's coming up (calendar, inbox, Notion tasks if you can reach them) and write a short digest: what matters, what to prep, what can wait. Delegate research to teammates when useful.",
    shape: "drop",
    color: "#FF5A00",
    provider: "claude",
  },
  {
    key: "triage",
    name: "Inbox Triage",
    role: "Sorts email, drafts replies, flags what needs you",
    instructions:
      "Go through new email, group it (needs reply / FYI / noise), draft replies for the ones that need one, and ask before sending anything.",
    shape: "square",
    color: "#7A7A7A",
    provider: "claude",
  },
  {
    key: "research",
    name: "UX Research",
    role: "Digs into a question and comes back with sources",
    instructions:
      "Research thoroughly, cite sources with links, separate facts from your read on them. Save longer findings as a Markdown file in your workspace and share it.",
    shape: "pill",
    color: "#FF9500",
    provider: "claude",
  },
  {
    key: "design",
    name: "Design",
    role: "Proposes UI, reviews screenshots, writes specs",
    instructions:
      "Think like a product designer. Propose concrete options, explain trade-offs briefly, and produce specs or HTML mockups in your workspace when helpful.",
    shape: "blob",
    color: "#111111",
    provider: "claude",
  },
  {
    key: "engineer",
    name: "Engineer",
    role: "Builds and fixes code in your repos",
    instructions:
      "Work carefully in the repo you're pointed at: read before you change, run the tests, and summarize what you changed and why.",
    shape: "hex",
    color: "#1478FF",
    provider: "codex",
  },
  {
    key: "librarian",
    name: "Librarian",
    role: "Keeps your Notion and Drive tidy and findable",
    instructions:
      "Organize, summarize and file documents in Notion and Google Drive. Never delete anything without asking first.",
    shape: "cloud",
    color: "#00C060",
    provider: "claude",
  },
];

export const SHAPES: Shape[] = ["blob", "cloud", "drop", "hex", "square", "egg", "pill", "triangle", "flower", "bean"];
export const COLORS = [
  "#FF5A00",
  "#FF9500",
  "#FF2238",
  "#FF2E93",
  "#7B3FF2",
  "#1478FF",
  "#00B39A",
  "#00C060",
  "#8A5530",
  "#7A7A7A",
  "#111111",
];

export type ConnectorPreset = Omit<Connector, "id" | "createdAt"> & { blurb: string; secretKeys: string[] };

export const CONNECTOR_PRESETS: ConnectorPreset[] = [
  {
    name: "Notion",
    preset: "notion",
    blurb: "Official Notion MCP server. Create an internal integration at notion.so/my-integrations and paste its token.",
    kind: "stdio",
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    env: { NOTION_TOKEN: "" },
    url: "",
    headers: {},
    secretKeys: ["NOTION_TOKEN"],
  },
  {
    name: "Google Drive",
    preset: "gdrive",
    blurb: "Google Drive MCP server. Needs an OAuth client JSON from Google Cloud Console.",
    kind: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-gdrive"],
    env: { GDRIVE_OAUTH_PATH: "", GDRIVE_CREDENTIALS_PATH: "" },
    url: "",
    headers: {},
    secretKeys: [],
  },
  {
    name: "GitHub",
    preset: "github",
    blurb: "GitHub's hosted MCP server. Paste a fine-grained personal access token.",
    kind: "http",
    command: "",
    args: [],
    env: {},
    url: "https://api.githubcopilot.com/mcp/",
    headers: { Authorization: "Bearer " },
    secretKeys: ["Authorization"],
  },
  {
    name: "Browser",
    preset: "playwright",
    blurb: "Lets bots drive a real browser on this PC (Playwright).",
    kind: "stdio",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
    env: {},
    url: "",
    headers: {},
    secretKeys: [],
  },
  {
    name: "Custom",
    preset: "custom",
    blurb: "Any MCP server: a command to run, or an HTTP URL.",
    kind: "stdio",
    command: "",
    args: [],
    env: {},
    url: "",
    headers: {},
    secretKeys: [],
  },
];
