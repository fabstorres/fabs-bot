# Bots

Users build their team. A new bot starts in the main pane: pick a color and a shape, give it a name, and press Get started, or tap a suggestion to start from a template. Everything else (role, standing instructions, which agent CLI it runs on, model, desk folder, autonomy, plugins, routines) lives in the bot's settings behind the gear in its desk panel. Bots are listed in the sidebar, can be edited, and can be retired; retiring keeps the desk folder on disk.

## Sub-features

- `bots-first` shows the New Bot pane with "Create your first Bot" and "No chats yet" in the sidebar when there are no bots.
- `bots-create` creates a bot from the New Bot pane and opens its chat.
- `bots-suggest` fills the New Bot pane from a suggestion (name, shape, color, and the template's role and instructions).
- `bots-edit` saves changes made in the settings dialog, and the sidebar row reflects them.
- `bots-retire` removes the bot from the sidebar; its desk folder stays.

## How to get to it (user POV)

- Sidebar `+` (`New bot`), on desktop or phone.
- On first run with no bots, the New Bot pane is already open.
- Open a bot's chat, then `Open desk` → gear (`Edit <Name>`), or `More` → `Edit <Name>`.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README, except `bots-first`, which needs a fresh launch before `$C seed`.

- **First run.** On a fresh launch (before `seed`), run `$C browser open /` and `$C browser wait --role region --name "New bot"`. The sidebar text includes `Create your first Bot` and `No chats yet`. Capture `bots/first.aria.txt` plus `.png`.
- **Suggestion.** Run `$C browser click --role button --name "Suggestion Inbox Triage"`. The header and the `Name` field read `Inbox Triage`, and the `Shape` radio `square` is checked.
- **Create.** Run `$C browser fill --label "Name" --value "Verifier"`, choose `$C browser click --role radio --name "#7B3FF2"`, then `$C browser click --role button --name "Get started"`. `Thread with Verifier` opens, `--role button --name "Bot Verifier"` exists in the sidebar, `$C api GET /api/bots` lists `Verifier` with the template's role, and `<workRoot>/verifier/` exists (`$C paths`).
- **Edit.** Run `$C browser click --role button --name "Open desk"`, then `$C browser click --role button --name "Edit Verifier"`. In dialog `Edit Verifier`, fill `--label "Role" --value "Checks things three times"`, choose `--role radio --name "Ask me before acting"`, and click `Save`. `$C api GET /api/bots` shows the new role and `"autonomy": "ask"`.
- **Retire.** Open `Edit Verifier` again and run `$C browser click --role button --name "Retire" --accept-dialog`. `$C browser count --role button --name "Bot Verifier"` prints `0`, and `<workRoot>/verifier/` still exists.
- **Proof.** Capture `bots/first.*`, `bots/new-bot-filled.png`, `bots/editor.aria.txt` plus `.png`, and the `$C api GET /api/bots` output before and after retiring.

## Gotchas

- `Get started` stays disabled until the name has text.
- The editor's Brain list loads after the CLIs report their versions, about a second. Wait for `--role radio --name "Codex"` before choosing a non-default CLI.
- Brains marked `not installed` are disabled. Don't count a disabled option as a verified path.
- `Retire` and `Fresh memory` use browser confirm/alert dialogs. Without `--accept-dialog` the confirm is dismissed and nothing happens.
- Changing a bot's CLI or desk folder resets its saved sessions. Its next reply re-reads the thread.
- Color radios are named by hex value (`#1478FF`), shape radios by shape name (`blob`, `drop`, …).
