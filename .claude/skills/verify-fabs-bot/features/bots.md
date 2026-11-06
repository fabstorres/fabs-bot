# Bots

Users build their team. A fresh install already has one bot, Chief of Staff, waiting in its chat. A new bot starts in the main pane: pick a color and a shape, give it a name, and press Get started, or tap a suggestion to start from a template. Every new bot opens its chat with a hello and a "What should I own for you?" card, so it's ready to go. Name, label and description are edited inline on the desk panel's Settings page; everything else (standing instructions, which agent CLI it runs on, model, desk folder, autonomy, plugins, routines) lives behind its More settings button. A new bot starts on its CLI's Default model from Settings → Providers. The Model field is a picker of that CLI's recent and legacy models, `CLI default`, and `Custom model…` for any other ID. Switching the Brain moves the model to the new CLI's Default model. Bots are listed in the sidebar with their label as a chip, can be edited, and can be retired; retiring keeps the desk folder on disk. The team lead (one bot at most, the `Team lead` switch in its editor) gets its own spot above the list instead of a row: a large avatar with a star badge and its name. It shows the same selected state, `Needs you` / `Unread` dot and live status as a row, and a click does what the row did. Search lists it as a normal row. On phone the favorites row skips it.

## Sub-features

- `bots-first` starts a fresh install with `Chief of Staff` in the sidebar and its chat open, holding the greeting card.
- `bots-empty` shows the New Bot pane with "Create your first Bot" and "No chats yet" in the sidebar once every bot is retired.
- `bots-create` creates a bot from the New Bot pane and opens its chat on the greeting card.
- `bots-greeting` answers the greeting card; the bot replies with that context, and the card never raises the `Needs you` dot.
- `bots-settings` saves name, label, and description from the desk panel's Settings page when a field loses focus; the label shows as a chip in the sidebar row.
- `bots-suggest` fills the New Bot pane from a suggestion (name, shape, color, and the template's role and instructions).
- `bots-edit` saves changes made in the settings dialog, and the sidebar row reflects them.
- `bots-model` starts a new bot on its CLI's Default model, shows it in the editor's Model picker, saves a picked or custom model, and switches the model to the new CLI's Default model when the Brain changes.
- `bots-keyboard` makes each radio group (Color, Shape, Brain, Autonomy) one Tab stop on its selected option; arrow keys move and select, and the editor opens with focus on `Name`.
- `bots-retire` removes the bot from the sidebar; its desk folder stays.
- `bots-lead` shows the team lead in its own spot above the list, not in the list, with the row's selected state, dots and status; search finds it as a row, and no lead means no spot.

## How to get to it (user POV)

- Sidebar `+` (`New bot`), on desktop or phone.
- On first run, Chief of Staff's chat is already open (desktop).
- Once every bot is retired, the New Bot pane is open.
- Open a bot's chat, then `Open desk` → `Show settings` for name, label, and description, and `More settings` (`Edit <Name>`) for the rest; or `More` → `Edit <Name>`.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README, except `bots-first`, which needs a fresh launch before `$C seed`.
- `bots-greeting` needs a logged-in `claude`.
- `bots-model` needs Codex installed for the Brain switch.

- **First run.** On a fresh launch (before `seed`), run `$C browser open /` and `$C browser wait --role region --name "Thread with Chief of Staff"`. The thread holds `--role group --name "Question: What should I own for you?"`, and `$C browser count --role img --name "Needs you"` prints `0`. Capture `bots/first.aria.txt` plus `.png`.
- **Greeting.** Click `$C browser click --role button --name "A Day-to-day ops"`. Get `<T>` with the README eval and run `$C wait <T> --for idle`. `$C thread <T>` shows the user's `A. Day-to-day ops` and a reply about day-to-day work. The reply may end on a follow-up question of its own. Then `wait` exits 1 with `ended waiting on you`, which still passes this step; `ended in an error` fails it.
- **Suggestion.** Run `$C browser click --role button --name "New bot"`, then `$C browser click --role button --name "Suggestion Inbox Triage"`. The header and the `Name` field read `Inbox Triage`, and the `Shape` radio `square` is checked.
- **Create.** Run `$C browser fill --label "Name" --value "Verifier"`, choose `$C browser click --role radio --name "#7B3FF2"`, then `$C browser click --role button --name "Get started"`. `Thread with Verifier` opens on `Question: What should I own for you?`, `--role button --name "Bot Verifier"` exists in the sidebar, `$C api GET /api/bots` lists `Verifier` with the template's role, and `<workRoot>/verifier/` exists (`$C paths`).
- **Inline settings.** Run `$C browser click --role button --name "Open desk"`, then `$C browser click --role button --name "Show settings"`. Fill `--label "Label (optional)" --value "Checker"` and press `Tab`. `$C api GET /api/bots` shows `"label": "Checker"`, and the `Bot Verifier` row shows a `Checker` chip.
- **Edit.** On the same Settings page, run `$C browser click --role button --name "Edit Verifier"`. In dialog `Edit Verifier`, fill `--label "Role" --value "Checks things three times"`, choose `--role radio --name "Ask me before acting"`, and click `Save`. `$C api GET /api/bots` shows the new role and `"autonomy": "ask"`.
- **Model.** In Settings → Providers, set Claude Code's `--role combobox --name "Default model"` to `Claude Haiku 5.5` and Codex's to `GPT-6 Luna` (see [Providers](./providers.md)). Create a bot from the New Bot pane. `$C api GET /api/bots` shows it with `"model": "claude-haiku-5-5"`. Open `Edit <Name>`: `--role combobox --name "Model"` reads `Claude Haiku 5.5`, and focus is still on `Name`. Click `--role radio --name "Codex"`; the Model combobox reads `GPT-6 Luna`. Click `Codex` again; the model stays. Click the Model combobox, then `--role option --name "Custom model…"`, fill `--label "Model ID" --value "gpt-6.1-terra"`, press `Tab`, and click `Save`. The API shows `"provider": "codex"` and `"model": "gpt-6.1-terra"`, and `Edit <Name>` reopens on `Custom model…` with that ID. Capture `bots/model.aria.txt` plus `.png` at 1440x900 and 430x932.
- **Keyboard.** In the New Bot pane, press `$C browser press --selector ":focus" --key Shift+Tab`. Focus lands on the checked `Shape` radio. `ArrowRight` checks the next shape, and another `Shift+Tab` lands on the checked `Color` radio, not on another shape. In `Edit <Name>`, `$C browser eval "document.activeElement.getAttribute('aria-label')"` prints `Name` right after it opens, and `Brain` / `Autonomy` follow the same arrow-key rules. Read focus and `[role=radio][aria-checked=true]` back with `browser eval` after each key.
- **Team lead.** Open `Edit Chief`, turn on `--role switch --name "Team lead"` and `Save`. `--role group --name "Team lead"` holds `--role button --name "Bot Chief"`, and `$C browser snapshot --role navigation --name "Chats"` has no `Bot Chief` row. Fill `--label "Search bots" --value "chief"`: the spot goes and `Bot Chief` is a row. At 430x932 the `Open <Name>` favorites skip Chief. Ask Chief to `use ask_user`, open another chat, and the spot shows `Needs you` and the status line; answer, open another chat, and it shows `Unread` once the reply lands. Capture `bots/lead.aria.txt` plus `.png`.
- **Retire.** Open `Edit Verifier` again and run `$C browser click --role button --name "Retire" --accept-dialog`. `$C browser count --role button --name "Bot Verifier"` prints `0`, and `<workRoot>/verifier/` still exists.
- **Proof.** Capture `bots/first.*`, `bots/new-bot-filled.png`, `bots/settings.aria.txt` plus `.png`, `bots/editor.aria.txt` plus `.png`, and the `$C api GET /api/bots` output before and after retiring.

## Gotchas

- `Get started` stays disabled until the name has text.
- The editor's Brain list loads after the CLIs report their versions, about a second. Wait for `--role radio --name "Codex"` before choosing a non-default CLI.
- The Model picker shows a skeleton until the CLI list loads. Wait for `--role combobox --name "Model"` before reading it.
- A bot whose model isn't in its CLI's list, like the old `opus` or `haiku` aliases, shows `Custom model…` with that ID in `Model ID`.
- With `Custom model…` showing, `--label "Model"` also matches `Model ID`. Use `--role combobox --name "Model"` for the picker.
- Brains marked `not installed` are disabled. Don't count a disabled option as a verified path.
- `Retire` and `Fresh memory` use browser confirm/alert dialogs. Without `--accept-dialog` the confirm is dismissed and nothing happens.
- Changing a bot's CLI or desk folder resets its saved sessions. Its next reply re-reads the thread.
- Settings fields save on blur. Typing without leaving the field saves nothing.
- `browser press` with `--role` or `--label` focuses that element before pressing. That skips the Tab order you are testing, so drive keyboard checks with `--selector ":focus"`.
- Color radios are named by hex value (`#1478FF`), shape radios by shape name (`blob`, `drop`, …).
