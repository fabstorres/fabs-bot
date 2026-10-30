# Bots

Users build their team. A fresh install already has one bot, Chief of Staff, waiting in its chat. A new bot starts in the main pane: pick a color and a shape, give it a name, and press Get started, or tap a suggestion to start from a template. Every new bot opens its chat with a hello and a "What should I own for you?" card, so it's ready to go. Name, label and description are edited inline on the desk panel's Settings page; everything else (standing instructions, which agent CLI it runs on, model, desk folder, autonomy, plugins, routines) lives behind its More settings button. Bots are listed in the sidebar with their label as a chip, can be edited, and can be retired; retiring keeps the desk folder on disk.

## Sub-features

- `bots-first` starts a fresh install with `Chief of Staff` in the sidebar and its chat open, holding the greeting card.
- `bots-empty` shows the New Bot pane with "Create your first Bot" and "No chats yet" in the sidebar once every bot is retired.
- `bots-create` creates a bot from the New Bot pane and opens its chat on the greeting card.
- `bots-greeting` answers the greeting card; the bot replies with that context, and the card never raises the `Needs you` dot.
- `bots-settings` saves name, label, and description from the desk panel's Settings page when a field loses focus; the label shows as a chip in the sidebar row.
- `bots-suggest` fills the New Bot pane from a suggestion (name, shape, color, and the template's role and instructions).
- `bots-edit` saves changes made in the settings dialog, and the sidebar row reflects them.
- `bots-keyboard` makes each radio group (Color, Shape, Brain, Autonomy) one Tab stop on its selected option; arrow keys move and select, and the editor opens with focus on `Name`.
- `bots-retire` removes the bot from the sidebar; its desk folder stays.

## How to get to it (user POV)

- Sidebar `+` (`New bot`), on desktop or phone.
- On first run, Chief of Staff's chat is already open (desktop).
- Once every bot is retired, the New Bot pane is open.
- Open a bot's chat, then `Open desk` → `Show settings` for name, label, and description, and `More settings` (`Edit <Name>`) for the rest; or `More` → `Edit <Name>`.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README, except `bots-first`, which needs a fresh launch before `$C seed`.
- `bots-greeting` needs a logged-in `claude`.

- **First run.** On a fresh launch (before `seed`), run `$C browser open /` and `$C browser wait --role region --name "Thread with Chief of Staff"`. The thread holds `--role group --name "Question: What should I own for you?"`, and `$C browser count --role img --name "Needs you"` prints `0`. Capture `bots/first.aria.txt` plus `.png`.
- **Greeting.** Click `$C browser click --role button --name "A Day-to-day ops"`. Get `<T>` with the README eval and run `$C wait <T> --for idle`. `$C thread <T>` shows the user's `A. Day-to-day ops` and a reply about day-to-day work. The reply may end on a follow-up question of its own. Then `wait` exits 1 with `ended waiting on you`, which still passes this step; `ended in an error` fails it.
- **Suggestion.** Run `$C browser click --role button --name "New bot"`, then `$C browser click --role button --name "Suggestion Inbox Triage"`. The header and the `Name` field read `Inbox Triage`, and the `Shape` radio `square` is checked.
- **Create.** Run `$C browser fill --label "Name" --value "Verifier"`, choose `$C browser click --role radio --name "#7B3FF2"`, then `$C browser click --role button --name "Get started"`. `Thread with Verifier` opens on `Question: What should I own for you?`, `--role button --name "Bot Verifier"` exists in the sidebar, `$C api GET /api/bots` lists `Verifier` with the template's role, and `<workRoot>/verifier/` exists (`$C paths`).
- **Inline settings.** Run `$C browser click --role button --name "Open desk"`, then `$C browser click --role button --name "Show settings"`. Fill `--label "Label (optional)" --value "Checker"` and press `Tab`. `$C api GET /api/bots` shows `"label": "Checker"`, and the `Bot Verifier` row shows a `Checker` chip.
- **Edit.** On the same Settings page, run `$C browser click --role button --name "Edit Verifier"`. In dialog `Edit Verifier`, fill `--label "Role" --value "Checks things three times"`, choose `--role radio --name "Ask me before acting"`, and click `Save`. `$C api GET /api/bots` shows the new role and `"autonomy": "ask"`.
- **Keyboard.** In the New Bot pane, press `$C browser press --selector ":focus" --key Shift+Tab`. Focus lands on the checked `Shape` radio. `ArrowRight` checks the next shape, and another `Shift+Tab` lands on the checked `Color` radio, not on another shape. In `Edit <Name>`, `$C browser eval "document.activeElement.getAttribute('aria-label')"` prints `Name` right after it opens, and `Brain` / `Autonomy` follow the same arrow-key rules. Read focus and `[role=radio][aria-checked=true]` back with `browser eval` after each key.
- **Retire.** Open `Edit Verifier` again and run `$C browser click --role button --name "Retire" --accept-dialog`. `$C browser count --role button --name "Bot Verifier"` prints `0`, and `<workRoot>/verifier/` still exists.
- **Proof.** Capture `bots/first.*`, `bots/new-bot-filled.png`, `bots/settings.aria.txt` plus `.png`, `bots/editor.aria.txt` plus `.png`, and the `$C api GET /api/bots` output before and after retiring.

## Gotchas

- `Get started` stays disabled until the name has text.
- The editor's Brain list loads after the CLIs report their versions, about a second. Wait for `--role radio --name "Codex"` before choosing a non-default CLI.
- Brains marked `not installed` are disabled. Don't count a disabled option as a verified path.
- `Retire` and `Fresh memory` use browser confirm/alert dialogs. Without `--accept-dialog` the confirm is dismissed and nothing happens.
- Changing a bot's CLI or desk folder resets its saved sessions. Its next reply re-reads the thread.
- Settings fields save on blur. Typing without leaving the field saves nothing.
- `browser press` with `--role` or `--label` focuses that element before pressing. That skips the Tab order you are testing, so drive keyboard checks with `--selector ":focus"`.
- Color radios are named by hex value (`#1478FF`), shape radios by shape name (`blob`, `drop`, …).
