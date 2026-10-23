---
name: verify-fabs-bot
description: Launch an isolated Fabs Bot instance and prove its behavior the way a user sees it — the bot sidebar, chats, the desk panel, file sharing, bot↔bot messaging, question/approval cards, and Tailscale pairing — with a headless browser plus real agent CLI turns. Use whenever you change Fabs Bot (server, providers, MCP tools, or web UI) and need evidence it works, or when asked to "verify", "smoke test", or "prove" a Fabs Bot feature.
---

# Verify Fabs Bot

Fabs Bot is a Bun server (`server/`) and a React web app (`web/`). Bots are real agent CLI processes (`claude -p`, `codex exec`, …) that the server spawns per turn. Each turn gets a per-turn `fabsbot` MCP server, so a bot can message other bots, ask the user questions, and share files. Users reach the app in a browser on the PC, or from a phone over Tailscale.

You verify it with `control-fabs`, the harness in this folder. It starts a **private** instance with its own port, database, and bot desks, drives it through headless Chromium, and collects evidence that survives teardown. **Never drive the user's own instance** (default port 4800, `~/.fabs-bot`, `~/FabsBot`). It holds their real bots and threads.

```sh
C=.claude/skills/verify-fabs-bot/scripts/control-fabs   # run from the repo root
$C help
```

Requirements: `bun`, `node`, and a Chromium. The harness picks the newest browser under `~/.cache/ms-playwright/chromium-*`, or system Chrome/Chromium; override with `FABS_VERIFY_CHROME`. `playwright-core` comes from the repo's devDependencies (`bun install`). Real bot turns need a logged-in `claude` CLI; `codex` is optional.

## Launch

```sh
$C launch                # builds web, starts on the first free port ≥ 4870, loopback only
$C launch --tailnet      # also binds this PC's Tailscale IP (pairing and the desktop app's remote PC)
$C launch --tailnet --tailscale-shim   # plus a simulated `tailscale serve` (Tailscale HTTPS)
```

`--tailscale-shim` puts a stand-in `tailscale` first on the instance's PATH. `status` goes to the real CLI (read-only). `serve` changes go to a copy of the user's serve config kept in the run dir, and anything else fails. Never turn on Tailscale HTTPS without it: that would change the user's real Tailscale.

It's ready when the command prints `ready  run=<id>  url=http://127.0.0.1:<port>`; it has already polled `/api/host` until it answered. Run state lives in `$XDG_RUNTIME_DIR/fabs-verify/<run>/` (data dir, bot desks, `server.log`, browser profile). Evidence goes to `.verify/artifacts/<run>/` in the repo, which is gitignored. Only one instance per run; `launch` refuses if the current run is still up. Use `--run <id>` to address a specific run.

The server runs from source and the web app from `dist/web`. After you edit `server/`, `shared/`, or `web/`, run `cleanup` and `launch` again. `doctor` warns when either is stale.

Teardown is `$C cleanup` (see Cleanup).

## Doctor

```sh
$C doctor
```

Read-only. Exit code 1 on any `FAIL`. It checks:
- the server pid is alive and is `server/index.ts`;
- the port is owned by that pid;
- `/api/host` answers, and its work root is this run's scratch dir (proof you are on the isolated instance, not the user's);
- the web build is newer than its sources, and the server source hasn't changed since launch;
- which agent CLIs are installed;
- the browser's CDP port answers.

Run it first, after any surprising result, and after any failed drive. If it fails, `cleanup` and `launch` again rather than driving a sick instance.

## Drive

Setup goes through the API; behavior goes through the UI. Seed fixtures once:

```sh
$C seed      # Chief, Design (Claude haiku), Careful (Claude haiku, "ask" autonomy), Engineer (Codex, if installed)
             # alongside the starter bot every fresh install gets: Chief of Staff
```

Then drive the browser. Every command connects, acts, and disconnects; the page, cookies, and viewport persist between commands.

```sh
$C browser start [--viewport 1440x900]      # 430x932 for the phone layout; restart to switch
$C browser open /
$C browser click --role button --name "Bot Chief"
$C browser wait  --role region --name "Thread with Chief"
$C browser fill  --label "Message" --value "…"
$C browser press --label "Message" --key Enter
$C browser eval  "document.querySelector('[role=region][data-thread-id]').dataset.threadId"
$C wait <threadId> --for file|question|approval|idle|text:<substring> [--timeout 180]
$C thread <threadId>                        # compact dump: authors, tool steps, files, cards
```

Targets are ARIA roles and names that the app sets on purpose. Prefer them over CSS:

| UI | handle |
|---|---|
| sidebar | `--role complementary --name "Bots"`; bot rows `--role button --name "Bot <Name>"` (preview line shows live status); group rows `"Thread: <title>"`; row dots `--role img --name "Needs you"` / `"Unread"`; search `--label "Search bots"`; `"New bot"` (`+`), `"Plugins"`, `"This PC"` |
| phone favorites | `--role button --name "Open <Name>"` (big faces above the list, 430px only) |
| new bot pane | `--role region --name "New bot"`; `--role radio` in groups `Color` / `Shape`; `--label "Name"`; suggestions `"Suggestion <Template>"`; `"Get started"` |
| open thread | `--role region --name "Thread with <title>"`; conversation `--role log --name "Conversation"`; composer `--label "Message"`, `"Send"` (`"Environment disconnected"` while offline), `"Stop"`, `"Attach"`; offline banner `--role alert` with `"Reconnect"` |
| thread header | `"Back"` (phone, or desktop inside a backchannel), `"Open desk"`, `"More"`; menu `--role menu --name "Thread menu"` |
| cards | `--role group --name "Question: <q>"` (options are buttons named `"<Letter> <option>"`); `--role group --name "Approval: <Tool>"` with buttons `Allow` / `Deny`; bot↔bot `--role button --name "Exchange with <Bot>"` (opens the backchannel) |
| desk panel | `--role complementary --name "<Bot>'s desk"`; files `--role group --name "Desk files"`; routines `--role group --name "Routine <name>"`; pager `"Show desk"` / `"Show settings"`; Settings page inputs `Name`, `Label (optional)`, `Description` and `"Edit <Bot>"` (More settings); `"Close desk"`; group threads add `"Show <Bot>"` |
| files | chip `--role button --name "File <name>"`; viewer `--role dialog --name "<name>"` |
| bot editor | dialog `"Edit <Name>"`; inputs by label: `Name`, `Role`, `How it works`, `Model`, `Desk folder`; `--role radio` in groups `Shape` / `Color` / `Brain` / `Autonomy` |
| This PC panel | `--role switch --name "Tailscale HTTPS"` inside `--role group --name "Tailscale HTTPS"` |
| desktop launcher | `--role region --name "PCs"`; rows `--role group --name "PC <name>"` with `"Open"` / `"Forget <name>"`; form `--role form --name "Add a PC"` with `--label "Pairing link or address"`, `--label "Name (optional)"`, `"Connect"`; errors `--role alert` |

Other drivers:
- `browser click|fill|press|wait|count|text`
- `api <METHOD> <path> [json]`
- `threads`
- `paths` (scratch dirs for checking files on disk)
- `logs`
- `pair-check`: the remote-device auth matrix over the tailnet; needs `--tailnet`.
- `serve-shim state|log|occupy <port>|fail <stderr>`: inspect or rig the simulated serve config.
- `serve-check`: the Tailscale HTTPS auth matrix.
- `server stop|start`: stop the run's server (and any bot CLI mid-turn) and start it again on the same port and data, for offline behavior.

### Desktop app

```sh
$C desktop start [--fresh]          # Electron inside a virtual kwin_wayland compositor; nothing reaches the screen
$C desktop menu "Switch PC…"        # click a real application-menu item
$C desktop stop
```

- While the app runs, `browser` actions drive its newest window. `browser open` is refused; drive the launcher instead.
- The app gets this run's port and its own data dir. `--fresh` wipes saved PCs and cookies.
- `browser fill --value @pair-link` or `--value @tailnet-url` types the tailnet link without it appearing anywhere (needs `--tailnet`).

Real bot turns cost money and take time (usually 3–30 s on haiku). Wait on observable state with `$C wait` or `browser wait`, never fixed sleeps. Phrase prompts so the bot must use the tool you are proving, for example "share it with share_file" or "use ask_user".

## Evidence

Put everything under the run's artifacts dir, using paths relative to it: `--path <feature>/<step>.png`.

- **UI proof** is an ARIA snapshot plus a screenshot of the same state with the same basename (`x.aria.txt` + `x.png`):
  ```sh
  $C browser snapshot --role region --name "Thread with Chief" --path direct-chat/thread.aria.txt
  $C browser screenshot --path direct-chat/thread.png
  ```
- **Thread proof** is `$C thread <id> > …/thread.txt` (redacted). It shows which tools actually ran.
- **Side-effect proof** reads the result back from a second place. A file shared in chat must also appear on disk (`$C paths` → `workRoot/<bot-slug>/…`) and in the bot's desk. A sent message must survive `browser open /` (a reload).

Proof standards:
- Exercise the real user path: the sidebar, the composer, and the cards in the browser. Use the API only for seeding and for reading back.
- Capture the action and the resulting state, not just the final screen.
- Verify side effects as well as what's visible.
- No mocks: the agent CLIs are the product.
- When a bot answers in prose instead of using the tool you asked for, that's a failed drive. Rephrase and retry; don't count prose as proof.

**Privacy.** The user's Tailscale hostname, tailnet IPs, and pairing token must never land in shared evidence, PRs, or chat.
- The harness redacts them from everything it prints and snapshots.
- Screenshots mask the PC-name chip, any text with this PC's own name (the offline banner shows it), the pairing QR, and the pairing link by default (`--no-mask` to opt out locally). Text output redacts this PC's name to `<pc>`.
- `pair-check` and `browser pair` resolve the tailnet URL internally.
- Don't screenshot the "This PC" panel unmasked.
- Before anything leaves the machine, run `$C privacy-check`. It scans text artifacts and flags any PNG that lacks a clean `.aria.txt` twin.
- A clean ARIA twin can't prove every pixel is private, especially when the snapshot covers less than the screenshot. Look at each screenshot yourself before sharing it.
- Redaction and scanning share one rule set in `scripts/privacy.mjs`. After changing it, run `bun test ./.claude/skills/verify-fabs-bot/scripts/privacy.test.ts`.

## Cleanup

```sh
$C cleanup
```

What it does:
- stops the browser and the server by process group, using pids recorded at launch (never by process name), which also takes down any bot CLI mid-turn;
- deletes the run's scratch dir (database, desks, profile);
- prints `evidence kept: .verify/artifacts/<run> (N entries)`.

Check that line, or `ls` the dir: cleanup must never eat the proof. Run cleanup after failed iterations too.

## Helpers

- `scripts/control-fabs` (Bun): every command above; `$C help` lists them.
- `scripts/browser-driver.mjs` (Node): the browser half, invoked by `control-fabs browser …`. It exists because Playwright's CDP websocket hangs under Bun. Don't call it directly.

## Feature map

[`features/README.md`](features/README.md) indexes the user-facing features and how to prove each one. A proof that drives only one convenient entry point is incomplete when the map lists others. Keep the map honest as the app changes; the maintenance loop is cursor/plugins `pstack/skills/maintain-verification-skill`.
