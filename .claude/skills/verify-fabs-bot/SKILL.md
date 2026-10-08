---
name: verify-fabs-bot
description: Launch an isolated Fabs Bot instance and prove its behavior the way a user sees it — the field of bots, threads, file sharing, bot↔bot messaging, question/approval cards, and Tailscale pairing — with a headless browser plus real agent CLI turns. Use whenever you change Fabs Bot (server, providers, MCP tools, or web UI) and need evidence it works, or when asked to "verify", "smoke test", or "prove" a Fabs Bot feature.
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
$C launch --tailnet      # also binds this PC's Tailscale IP (needed only for the pairing feature)
```

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
```

Then drive the browser. Every command connects, acts, and disconnects; the page, cookies, and viewport persist between commands.

```sh
$C browser start [--viewport 1440x900]      # 430x932 for the phone layout; restart to switch
$C browser open /
$C browser wait  --role button --name "Bot Chief"
$C browser fill  --label "Hand off work" --value "@Chief …"
$C browser press --label "Hand off work" --key Enter
$C browser wait  --role region --name "Thread with Chief"
$C browser eval  "document.querySelector('[role=region][data-thread-id]').dataset.threadId"
$C wait <threadId> --for file|question|approval|idle|text:<substring> [--timeout 180]
$C thread <threadId>                        # compact dump: authors, tool steps, files, cards
```

Targets are ARIA roles and names that the app sets on purpose. Prefer them over CSS:

| UI | handle |
|---|---|
| field bot | `--role button --name "Bot <Name>"`; bot card `--role dialog --name "<Name> card"` |
| status bubble | `--role button --name "<Name> status:"` |
| dock input | `--label "Hand off work"`; send `--role button --name "Start thread"` |
| inbox | `--role complementary --name "Inbox"`; rows `--role button --name "Thread: <title>"`; filters `--role tab --name "Threads"`, `"Needs you"`, `"Bot ↔ bot"` |
| open thread | `--role region --name "Thread with <title>"`; conversation `--role log --name "Conversation"`; composer `--label "Message"` |
| thread header | `"Back"`, `"Open desk"`, `"More"`; menu `--role menu --name "Thread menu"` |
| cards | `--role group --name "Question: <q>"` (options are buttons named `"<Letter> <option>"`); `--role group --name "Approval: <Tool>"` with buttons `Allow` / `Deny` |
| files | chip `--role button --name "File <name>"`; viewer `--role dialog --name "<name>"`; desk `--role dialog --name "<Bot>'s desk"` |
| top bar | `"This PC"`, `"Connectors"`, `"New bot"`; search `--label "Search threads"` |
| bot editor | dialog `"New bot"` or `"Edit <Name>"`; inputs by label: `Name`, `Role`, `How it works`, `Model`, `Desk folder`; `--role radio` for Brain and Autonomy |

Other drivers: `browser click|fill|press|wait|count|text`, `api <METHOD> <path> [json]`, `threads`, `paths` (scratch dirs for checking files on disk), `logs`, and `pair-check` (the remote-device auth matrix over the tailnet; needs `--tailnet`).

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
- Exercise the real user path: the dock, the composer, and the cards in the browser. Use the API only for seeding and for reading back.
- Capture the action and the resulting state, not just the final screen.
- Verify side effects as well as what's visible.
- No mocks: the agent CLIs are the product.
- When a bot answers in prose instead of using the tool you asked for, that's a failed drive. Rephrase and retry; don't count prose as proof.

**Privacy.** The user's Tailscale hostname, tailnet IPs, and pairing token must never land in shared evidence, PRs, or chat.
- The harness redacts them from everything it prints and snapshots.
- Screenshots mask the PC-name chip, the pairing QR, and the pairing link by default (`--no-mask` to opt out locally).
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
