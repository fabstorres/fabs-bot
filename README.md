<img src="web/public/icon.svg" width="64" height="64" alt="">

# Fabs Bot

A team of always-on agents that live on your PC and use it as their workplace. They run on the agent CLIs you already have (Claude Code, Codex, and others), and you reach them from your phone or laptop over Tailscale.

It's laid out like Grok Bot: a sidebar of bots, a chat with the one you picked, and a desk panel with its files and routines. Each bot has a role, a desk folder, plugins, and routines. You can watch them work, see them message each other, and step in when one needs you.

## Run it

```sh
bun install
bun run start        # builds the web app, then serves on :4800
```

The server listens on `127.0.0.1` and on this PC's Tailscale IP. It never listens on your LAN. To pair a phone or laptop, open the app on the PC, tap *This PC*, choose *Pair a device*, and scan the QR code with your phone (the phone must be on your tailnet). Each pairing link works once and expires after 5 minutes. Every paired device gets its own sign-in and shows up under *Paired devices*, where *Remove* signs out just that device.

### Tailscale HTTPS

Optional, and off until you turn it on: *This PC → Tailscale HTTPS*. It serves the app at `https://<pc>.<tailnet>.ts.net:8443`, which turns on the mic and lets you install the app to your home screen. Every device still pairs once: scan the QR code or open the pairing link, which uses the `https://` address while this is on. An app installed to the home screen may need to pair again on its own. Fabs Bot never treats Tailscale's login header as proof of who you are.

Under the hood it runs `tailscale serve --bg --https=8443 http://127.0.0.1:4801`, and turning it off runs `tailscale serve --https=8443 off`. That HTTPS port is the only serve setting Fabs Bot ever touches:

- It never uses 443, so other apps' Tailscale HTTPS (for example one already on `:443`) keeps working.
- If another app already holds 8443, Fabs Bot refuses and changes nothing. Pick a free port with `FABS_TAILSCALE_SERVE_PORT`.
- Requests through HTTPS arrive on their own loopback port (`FABS_PORT + 1`). There they are never treated as coming from this PC, and the bots' MCP endpoint is refused.

### Desktop app

```sh
bun run desktop      # builds, then opens the Electron app
```

The desktop app is a window onto a Fabs Bot server: this PC's, or another PC's on your tailnet. Run it on your laptop to work with the bots on your PC:

1. On the PC, open *Settings → This PC*, choose *Pair a device*, and copy the link. It works once, within 5 minutes. With Tailscale HTTPS on, the link uses the `https://` address.
2. On the laptop, open the PC menu at the top of the sidebar, choose *Manage PCs…*, and paste it under *Add a PC*.

The app opens straight into a PC, with no picker: the last saved PC you opened, else the newest one you paired, else *This PC*. The PC menu at the top of the sidebar switches between *This PC* and your saved PCs in one click, and sets each PC's icon. *Manage PCs…* there, or *File → Switch PC…* (`Ctrl/Cmd+Shift+O`), goes back to the list. For *This PC* it attaches to a server that's already running (`bun run start`); it doesn't start one yet. Its data (saved PCs, sign-ins) lives in its own `Fabs Bot` app-data folder.

To develop with hot reload: `bun run dev` (server + Vite together), then open `http://127.0.0.1:5173` on this PC. The Vite dev server is loopback-only; use `bun run start` to reach the app from other devices.

| env | default | |
|---|---|---|
| `FABS_PORT` | `4800` | |
| `FABS_DATA_DIR` | `~/.fabs-bot` | database, shared files, paired devices (`devices.json`, which keeps only a hash of each device's sign-in) |
| `FABS_WORK_ROOT` | `~/FabsBot` | bots' desk folders; `shared/` is visible to all of them and holds your uploads |
| `FABS_HOST` | – | bind to a single address instead of loopback + tailnet |
| `FABS_TAILSCALE_SERVE_PORT` | `8443` | HTTPS port for Tailscale HTTPS (never 443) |

## Versions

Fabs Bot is in alpha. Versions follow semver with an `alpha` pre-release, starting at `0.1.0-alpha.1`, and every release is a `v<version>` git tag. `package.json` holds the version. The server prints it on start, and *This PC* shows the version that PC is running.

To release, start from an up-to-date `main` with a clean tree:

```sh
bun pm version prerelease --preid alpha -m "chore(release): v%s"   # 0.1.0-alpha.1 → 0.1.0-alpha.2, commits, tags v0.1.0-alpha.2
git push origin main --follow-tags
```

## How it works

```
phone / laptop ──tailnet──▶ Bun server ──spawns per turn──▶ claude -p / codex exec / cursor-agent / opencode / gemini
                              │  ▲                                        │
                              │  └──── fabsbot MCP (loopback, per turn) ◀─┘
                              ▼
                           SQLite: bots, threads, messages, routines, connectors
```

- **Bots** pair a persona (name, role, instructions, look) with a CLI, model, desk folder, autonomy level, and connectors.
- **Turns.** Each message runs the bot's CLI headlessly in its desk folder. The CLI's own session is resumed, so a bot only gets new messages after its first turn. Output streams live into the thread: text, a compact work log of tool calls, and files.
- **The `fabsbot` MCP server** is injected into every Claude and Codex turn. It gives each bot these tools:
  - `message_bot`: a private bot↔bot backchannel. You can read it; the chat shows the exchange as a card that opens it.
  - `ask_user`: tap-to-answer question cards.
  - `share_file`
  - `set_status`: the live status line on the bot's sidebar row.
  - `set_topic`
  - `notify_user`
  - `schedule_routine`, `list_routines`, `delete_routine`
- **Group threads.** @mention bots in the composer, or use *More → Bring in a bot*, to pull them in. Bots hand each other the floor with @Name, with a limit on hops.
- **Autonomy.**
  - *Just do it*: Claude runs in bypass mode; Codex runs without approvals or sandbox.
  - *Ask me before acting*: Claude's permission prompts become Allow/Deny cards on your phone (`--permission-prompt-tool`), while reads stay free. Codex runs sandboxed to its workspace.
- **Plugins (connectors).**
  - Claude bots inherit your existing Claude Code MCP servers and claude.ai connectors, including Notion and Google Drive. Use *Plugins → Scan* to list them.
  - Connectors you add in Fabs Bot (Notion, Google Drive, GitHub, Browser, or any custom MCP server) are attached per bot and passed to each run.
- **Routines.** Cron schedules run a bot on a prompt in its own thread. Bots can also schedule routines themselves.

### Your configs are left alone

Fabs Bot never writes to `~/.claude.json`, `~/.codex/config.toml`, or Cursor or OpenCode configs. The one Tailscale setting it changes is its own HTTPS port, and only after you turn on Tailscale HTTPS. Everything is passed per run as flags: `--mcp-config` (inline JSON), `--append-system-prompt`, `--disallowedTools`, `codex -c key=value`, and similar.

## Provider support

| CLI | streaming | resume | team tools (MCP) | approvals |
|---|---|---|---|---|
| Claude Code | ✓ token stream | ✓ | ✓ | ✓ relayed to your phone |
| Codex | ✓ per item | ✓ | ✓ | sandbox instead |
| Cursor Agent | ✓ | ✓ | – | `--force` or nothing |
| OpenCode | ✓ | ✓ | – | skip-permissions or nothing |
| Gemini CLI | plain text | – | – | `-y` or nothing |

## Verify

`.claude/skills/verify-fabs-bot/` is a project skill that lets agents (Claude Code, and Cursor via the `.cursor/skills` symlink) prove the app works the way a user experiences it. It launches an isolated instance with its own port and data, drives it through headless Chromium plus real bot turns, keeps evidence in `.verify/artifacts/` (gitignored), and cleans up after itself.

```sh
C=.claude/skills/verify-fabs-bot/scripts/control-fabs
$C launch && $C doctor && $C seed && $C browser start && $C browser open /
# …drive a recipe from .claude/skills/verify-fabs-bot/features/…
$C privacy-check && $C cleanup
```

## Layout

```
server/            Bun HTTP + WebSocket server
  orchestrator.ts  turn queue, prompts, @mention routing, bot↔bot backchannels
  mcp.ts           the fabsbot MCP server bots call back into
  providers/       one adapter per CLI → normalized events
  scheduler.ts     routines (croner)
  tailscale.ts     Tailscale status, plus Tailscale HTTPS on its own serve port
  auth.ts          pairing codes, device sign-ins + loopback trust
shared/            types + bot templates + connector presets
web/               React app: Tailwind + shadcn (sidebar, chat, desk panel, new bot, dialogs, desktop launcher)
desktop/           Electron app: PC launcher, one window per connection
```
