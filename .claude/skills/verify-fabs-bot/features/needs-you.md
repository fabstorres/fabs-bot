# Needs you

When a bot needs the user, it asks instead of guessing. A question arrives as a card of lettered options that the user answers with one tap. A bot in "Ask me before acting" mode pauses before running commands or editing files and shows an Allow / Deny card. Waiting bots are flagged in the sidebar (amber `Needs you` dot, an avatar that turns into a "!", and `Waiting for your answer` as the preview line) until the user responds.

## Sub-features

- `needs-question` shows a question card with lettered options; tapping one posts the answer and the bot continues.
- `needs-question-flag` marks a bot that asked and has not been answered with the `Needs you` dot in its sidebar row.
- `needs-backchannel` surfaces a question asked inside a bot↔bot backchannel on both bots' rows (`Waiting for you in <A> ↔ <B>`); clicking either row opens that backchannel at the question.
- `needs-approve` blocks an "ask"-mode bot on an Allow / Deny card before a risky tool; Allow runs it.
- `needs-deny` makes Deny stop the action, and the bot reports it didn't happen.
- `needs-persist` keeps the `Needs you` dot while the question is open, across reloads and server restarts. A typed reply closes the question.
- `needs-stop` makes Stop deny a pending approval and drop work queued before the stop.

## How to get to it (user POV)

- Any bot may ask a question while it works; the card appears in the thread.
- A bot whose Autonomy is `Ask me before acting` (bot editor) produces approval cards.
- Scan the sidebar for amber `Needs you` dots.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README. `Careful` exists with Autonomy `Ask me before acting`.
- `claude` is logged in.

- **Ask.** Run `$C browser click --role button --name "Bot Chief"`, `$C browser fill --label "Message" --value "Use ask_user to ask me which fruit to put on a smoothie: mango, banana or berries. Then wait."` and `$C browser press --label "Message" --key Enter`. Get `<T>` with the README eval, then run `$C wait <T> --for question`. The chat shows `--role group --name "Question: …"` with buttons `A mango`, `B banana`, `C berries` (case follows the bot).
- **Flagged while unanswered.** Run `$C wait <T> --for idle`, then `$C browser snapshot --role complementary --name "Bots" --path needs-you/flagged.aria.txt`. Chief's row holds `img "Needs you"` and its text reads `Waiting for your answer`.
- **Answer.** Click the option by its full name from the snapshot, for example `$C browser click --role button --name "B banana"`. The chosen row turns bold with a check. A user bubble `B. banana` appears, and `$C wait <T> --for idle` ends with a reply that uses banana.
- **Approve.** Open `Bot Careful`, run `$C browser fill --label "Message" --value "Run this exact bash command: touch approved.txt — then tell me if it worked."` and press Enter. Get `<A>`, then run `$C wait <A> --for approval`. The card `--role group --name "Approval: Bash"` shows `touch approved.txt`. Click `$C browser click --role button --name "Allow"`; `$C browser wait --text "Allowed"` passes as the card flips. After `$C wait <A> --for idle`, `ls <workRoot>/careful/approved.txt` (from `$C paths`) succeeds.
- **Deny.** Repeat with `touch denied.txt` and click `Deny`. `$C browser wait --text "Denied"` passes, the bot says it couldn't run it, and `<workRoot>/careful/denied.txt` does not exist.
- **Persist.** Ask Chief a question as above and leave it open. Run `$C browser open /`; Chief's row still holds `img "Needs you"`. Needs you is derived from stored messages, so it also survives a server restart (check by restarting the server on the same `FABS_DATA_DIR`; `cleanup` deletes the data). Then type an answer into the composer instead of tapping: the card's options turn dim and the dot goes away (`$C browser count --role img --name "Needs you"` prints `0`).
- **Question in a backchannel.** In Chief's chat, send `Use the message_bot tool to tell Design exactly this: 'Please call your ask_user tool right now to ask the user which color they prefer: red or blue. Do not answer for them.' Then reply to me with one short sentence.` Poll `$C api GET /api/threads` until the `backchannel` row has `needsYou: true`. Run `$C browser open /`; `$C browser count --role img --name "Needs you"` prints `2`. Click `Bot Design`; `Thread with Chief ↔ Design` opens and holds `Question: …`. Tap an option; both dots clear.
- **Answer while streaming.** Ask `@Chief first call ask_user asking which fruit for a smoothie: mango, banana or berries. Right after that, without waiting, write a detailed 600-word essay on the history of smoothies.` After `$C wait <T> --for question`, check that the message is still `streaming`, then type an answer (or tap an option). After `$C wait <T> --for idle`, `$C thread <T>` shows `answered=-1` (typed) or the option index (tapped), and `needsYou` is `false` in `$C api GET /api/threads`.
- **Stop.** Ask Careful to `touch stopped.txt` and wait for the approval card. Send a second message `reply with only QUEUED_TURN_RAN`, then click `$C browser click --role button --name "Stop" --exact`. Within a few seconds the card reads `Denied` and `$C wait <S> --for text:Stopped` passes, `stopped.txt` doesn't exist, and `$C thread <S>` never shows `QUEUED_TURN_RAN`.
- **Proof.** Capture `needs-you/question.aria.txt` plus `.png` before answering, `needs-you/answered.aria.txt` after, `needs-you/approval.aria.txt` plus `.png` while pending, and `$C thread` dumps for `<T>` and `<A>`.

## Gotchas

- The decided card's result is a `status` region, which takes no accessible name from its text. Assert it with `--text "Allowed"` or `--text "Denied"`, not `--role status --name`.
- Use `--exact` for short button names like `Stop`. Without it, any button whose name contains "stop" matches first.
- After Stop, the last message is the user's queued one, so `wait --for idle` never passes. Wait for `text:Stopped` instead.
- Option buttons are named `<Letter> <option text>`. Read the snapshot for the exact text the bot chose.
- A new bot's greeting card is a question too, but it never raises `Needs you`. Count dots knowing that.
- The `Needs you` dot sits on the bot's row, not on a thread. A bot with several chats shows one dot if any of them waits.
- While a question is pending, clicking that bot's row opens the pending thread, not its usual direct chat. Answer it (or use the desk's `Chats`) before driving the direct chat.
- History survives `browser open /`. `Back` after a reload can land in a chat from before it; `browser start` gives a clean history.
- Approval cards only come from Claude bots in "ask" mode. A Codex bot in that mode is sandboxed to its desk instead and never shows a card.
- Reads (`Read`, `Grep`, web fetches) never prompt in ask mode. Use a command or a file write to trigger a card.
- An approval blocks the bot's turn until answered. Always click Allow or Deny, or run `cleanup`, so the CLI doesn't hang.
