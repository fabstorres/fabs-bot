# Bots

Users build their team. A bot can come from a template ("Meet your first bot") or be built from scratch: name, role, standing instructions, shape and color, which agent CLI it runs on, model, desk folder, autonomy, and connectors. Bots appear on the field. Each has a card with its details, can be edited, and can be retired; retiring keeps its desk folder on disk.

## Sub-features

- `bots-meet` lets the template carousel start a chat with a ready-made bot in one tap.
- `bots-create` builds a custom bot in the editor and opens a chat with it.
- `bots-card` opens a card when a bot on the field is clicked, showing role, CLI, autonomy, desk path, and recent threads.
- `bots-edit` saves changes made in the editor, and they show on the field and card.
- `bots-retire` removes the bot from the field; its desk folder stays.

## How to get to it (user POV)

- Top bar `New bot` (`+`), or `New` at the end of the phone bot strip.
- On first run with no bots, `Meet your first bot` on the welcome screen.
- Click a bot on the field for its card, then `Edit`. Or open a thread and choose `More` → `Edit <Name>`.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README.

- **Meet a template.** Run `$C browser click --role button --name "New bot"` and `$C browser wait --role dialog --name "Meet your first bot"`. Click `$C browser click --role button --name "Next"` until the heading reads `Inbox Triage` (`$C browser text --role dialog --name "Meet your first bot"`), then `$C browser click --role button --name "Start Chat"`. The sheet `Thread with Inbox Triage` opens, and `--role button --name "Bot Inbox Triage"` exists on the field.
- **Create custom.** Run `$C browser click --role button --name "New bot"`, then `$C browser click --role button --name "Create my own"`. Fill `$C browser fill --label "Name" --value "Verifier"` and `$C browser fill --label "Role" --value "Checks things twice"`, and choose `$C browser click --role radio --name "Ask me before acting"`. Click `$C browser click --role button --name "Create & chat"`. `Thread with Verifier` opens. `$C api GET /api/bots` lists `Verifier` with `"autonomy": "ask"`, and `<workRoot>/verifier/` exists (`$C paths`).
- **Card.** Close the sheet (`Back`) and click `$C browser click --role button --name "Bot Verifier"`. The dialog `Verifier card` shows `Checks things twice`, `claude`, and `Asks first`.
- **Edit.** In the card, click `$C browser click --role button --name "Edit"`. In dialog `Edit Verifier`, fill `--label "Role" --value "Checks things three times"` and click `Save`. Reopen the card; it shows the new role.
- **Retire.** Open `Edit Verifier` again and run `$C browser click --role button --name "Retire" --accept-dialog`. `$C browser count --role button --name "Bot Verifier"` prints `0`, and `<workRoot>/verifier/` still exists.
- **Proof.** Capture `bots/meet.aria.txt` plus `.png`, `bots/editor.aria.txt`, `bots/card.aria.txt` plus `.png` after the edit, and the `$C api GET /api/bots` output before and after retiring.

## Gotchas

- The editor's Brain list loads after the CLIs report their versions, about a second. Wait for `--role radio --name "Codex"` before choosing a non-default CLI.
- Brains marked `not installed` are disabled. Don't count a disabled option as a verified path.
- `Retire` and `Fresh memory` use browser confirm/alert dialogs. Without `--accept-dialog` the confirm is dismissed and nothing happens.
- Changing a bot's CLI or desk folder resets its saved sessions. Its next reply re-reads the thread.
- Field positions are per browser (localStorage). A new browser profile lays bots out in default slots.
