# Fabs Bot verification map

This directory is the maintained source for verifying the user-facing behavior of Fabs Bot. Read this index before driving the app, then use the matching feature file as the recipe. `$C` below means `.claude/skills/verify-fabs-bot/scripts/control-fabs`, run from the repo root.

## Baseline preconditions

- Launch with `$C launch`, which gives a loopback-only isolated instance at `http://127.0.0.1:<port ≥ 4870>`. [Pairing and access](./pairing-and-access.md) and [desktop app](./desktop-app.md) need `$C launch --tailnet`. [Tailscale HTTPS](./tailscale-https.md) needs `$C launch --tailnet --tailscale-shim`.
- `$C doctor` reports no `FAIL`, including `isolated work root confirmed`.
- `$C seed` has created `Chief`, `Design`, and `Careful` (Claude, haiku). `Engineer` (Codex) appears too when Codex is installed. The starter bot `Chief of Staff` is there from launch.
- Every bot's direct chat opens with a greeting card (`Question: What should I own for you?`). It never raises `Needs you`, and `$C wait --for question` ignores it.
- On desktop, `$C browser open /` lands in the most recent chat.
- `$C browser start` is running at `1440x900` unless the recipe says `430x932`, and `$C browser open /` shows `--role button --name "Bot Chief"` in the sidebar.
- Never drive an instance this run did not launch. The user's own instance on port 4800 is off limits.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names (the handle table in `SKILL.md`) over CSS selectors or positions.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Drive behavior through `$C browser …`. Use `$C api` and `$C seed` only for setup and read-back.
- Bot turns are real CLI runs. Wait with `$C wait <threadId> --for …` or `$C browser wait`, never fixed sleeps.
- Get the open thread's id with `$C browser eval "document.querySelector('[role=region][data-thread-id]').dataset.threadId"`.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof is an ARIA snapshot plus a screenshot with the same basename (`<feature>/<step>.aria.txt` and `.png`) showing the Fabs Bot sidebar, chat, or desk panel.
- Thread proof is `$C thread <id>`. It must show the tool the recipe asked for (for example `[tool fabsbot · share_file done]`).
- Mutation proof includes a second, read-only view: the file on disk via `$C paths`, the bot's desk, or the same thread after `$C browser open /`.
- Record the feature ID and entry point with every artifact (directory and file names do this).
- Report an unreachable path with the attempted command and the unmet precondition: CLI not logged in, Tailscale down, Codex missing.
- Do not report a skipped entry point as verified through a different path.
- Run `$C privacy-check` before sharing any artifact.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections, in this order:

1. `Sub-features`: short IDs, one line per behavior.
2. `How to get to it (user POV)`: every user entry point.
3. `Driving it with control-fabs`: starts with `Preconditions:`, then labeled bullets that pair each user action with an exact command and the observable result.
4. `Gotchas`: traps that waste or invalidate a run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Direct chat](./direct-chat.md): open a bot from the sidebar, hand it work, watch it work, open the file it shares, find it in the desk panel and on disk, see its routines, and the phone list → chat flow.
- [Teamwork](./teamwork.md): bot↔bot messaging shown as inline exchange cards that open the private backchannel, and group chats (sidebar rows, member switcher) driven by @mentions, shown as bot chips.
- [Needs you](./needs-you.md): tap-to-answer question cards, Allow/Deny approval cards, and the sidebar's `Needs you` dot.
- [Bots](./bots.md): the starter bot on a fresh install, create a bot in the New Bot pane (from scratch or a suggestion), the greeting card, inline settings with a label, the full editor, and retiring.
- [Pairing and access](./pairing-and-access.md): unpaired devices are refused, a one-time pairing link signs in one device over Tailscale, This PC lists paired devices and removes any one of them, and the bot MCP endpoint stays loopback-only.
- [Tailscale HTTPS](./tailscale-https.md): the This PC switch that serves the app over HTTPS on its own port, leaves other apps' serve ports alone, and trusts only pairing.
- [Desktop app](./desktop-app.md): the Electron launcher, opening This PC or a remote PC by pairing link, staying signed in across restarts, the PC menu (switch PCs, change a PC's icon, Manage PCs…), Switch PC, forgetting a PC, and keeping PC pages away from the launcher's controls.
- [Settings](./settings.md): the gear opens Settings as a dialog over the mounted chat with a section nav, search, a breadcrumb and close on desktop, list → section → back on the phone, and the Appearance theme (System, Light, Dark).
- [Limits](./limits.md): the gauge next to the gear opens Limits, one page with how much of the Claude Code and Codex usage windows is left, reset times, plan and credits, the not-installed, signed-out and error states, and Refresh.
- [Providers](./providers.md): the Providers section that lists the agent CLIs, turns them on or off for the Brain picker, and sets each one's display name, binary path, launch arguments, and environment variables for every bot run.
- [Server offline](./server-offline.md): the banner above the composer when the PC's server stops answering or the device goes offline, what it blocks, the refused-send toast, recovery, and the first-load notice.

Not yet mapped: running routines (settings → Routines → "Run now", or the desk panel's play button), plugins (Settings → Plugins), and sidebar search.
