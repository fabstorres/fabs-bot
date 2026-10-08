<img src="web/public/icon.svg" width="64" height="64" alt="">

# Fabs Bot

A team of always-on agents that live on your PC and use it as their workplace. They run on the agent CLIs you already have (Claude Code, Codex, and others), and you reach them from your phone or laptop over Tailscale.

It isn't another chat clone. The home screen is a **field** of bots. Each one has a role, a desk folder, connectors, and routines. You can watch them work, see them message each other, and step in when one needs you.

## Run it

```sh
bun install
bun run start        # builds the web app, then serves on :4800
```

The server listens on `127.0.0.1` and on this PC's Tailscale IP. It never listens on your LAN. On first start it prints a pairing link. You can also open the app on the PC, tap the PC name in the top-left, and scan the QR code with your phone (the phone must be on your tailnet).

Optional HTTPS, which turns on the mic and lets you install the app to your home screen. Run this yourself; Fabs Bot never changes Tailscale settings:

```sh
tailscale serve --bg 4800
```

With `tailscale serve`, your own devices sign in automatically through Tailscale identity headers.

To develop with hot reload: `bun run dev` (server + Vite together), then open `http://127.0.0.1:5173` on this PC. The Vite dev server is loopback-only; use `bun run start` to reach the app from other devices.

| env | default | |
|---|---|---|
| `FABS_PORT` | `4800` | |
| `FABS_DATA_DIR` | `~/.fabs-bot` | database, shared files, access token (`access-token`; delete it to revoke every paired device) |
| `FABS_WORK_ROOT` | `~/FabsBot` | bots' desk folders; `shared/` is visible to all of them and holds your uploads |
| `FABS_HOST` | – | bind to a single address instead of loopback + tailnet |

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
  - `message_bot`: a private bot↔bot backchannel. You can read it, and the field draws a link while they talk.
  - `ask_user`: tap-to-answer question cards.
  - `share_file`
  - `set_status`: the speech bubble on the field.
  - `set_topic`
  - `notify_user`
  - `schedule_routine`, `list_routines`, `delete_routine`
- **Group threads.** @mention bots in the dock or the composer to pull them in. Bots hand each other the floor with @Name, with a limit on hops.
- **Autonomy.**
  - *Just do it*: Claude runs in bypass mode; Codex runs without approvals or sandbox.
  - *Ask me before acting*: Claude's permission prompts become Allow/Deny cards on your phone (`--permission-prompt-tool`), while reads stay free. Codex runs sandboxed to its workspace.
- **Connectors.**
  - Claude bots inherit your existing Claude Code MCP servers and claude.ai connectors, including Notion and Google Drive. Use *Connectors → Scan* to list them.
  - Connectors you add in Fabs Bot (Notion, Google Drive, GitHub, Browser, or any custom MCP server) are attached per bot and passed to each run.
- **Routines.** Cron schedules run a bot on a prompt in its own thread. Bots can also schedule routines themselves.

### Your configs are left alone

Fabs Bot never writes to `~/.claude.json`, `~/.codex/config.toml`, Cursor or OpenCode configs, or Tailscale settings. Everything is passed per run as flags: `--mcp-config` (inline JSON), `--append-system-prompt`, `--disallowedTools`, `codex -c key=value`, and similar.

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
  tailscale.ts     read-only Tailscale status
  auth.ts          pairing token + Tailscale identity
shared/            types + bot templates + connector presets
web/               React app (field, inbox, sheets, editor, panels)
```
