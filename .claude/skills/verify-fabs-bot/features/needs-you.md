# Needs you

When a bot needs the user, it asks instead of guessing. A question arrives as a card of lettered options that the user answers with one tap. A bot in "Ask me before acting" mode pauses before running commands or editing files and shows an Allow / Deny card. Waiting bots are flagged on the field and under the Needs you tab until the user responds.

## Sub-features

- `needs-question` shows a question card with lettered options; tapping one posts the answer and the bot continues.
- `needs-question-flag` keeps a bot that asked and has not been answered in the Needs you tab and wiggling on the field.
- `needs-approve` blocks an "ask"-mode bot on an Allow / Deny card before a risky tool; Allow runs it.
- `needs-deny` makes Deny stop the action, and the bot reports it didn't happen.
- `needs-persist` keeps a thread under Needs you while its question is open, even after another thread with the same bot or a server restart. A typed reply closes the question.
- `needs-stop` makes Stop deny a pending approval and drop work queued before the stop.

## How to get to it (user POV)

- Any bot may ask a question while it works; the card appears in the thread.
- A bot whose Autonomy is `Ask me before acting` (bot editor) produces approval cards.
- Choose the `Needs you` tab in the Inbox to find threads waiting on the user.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README. `Careful` exists with Autonomy `Ask me before acting`.
- `claude` is logged in.

- **Ask.** Run `$C browser fill --label "Hand off work" --value "@Chief use ask_user to ask me which fruit to put on a smoothie: mango, banana or berries. Then wait."` and press Enter (`$C browser press --label "Hand off work" --key Enter`). Get `<T>` with the README eval, then run `$C wait <T> --for question`. The sheet shows `--role group --name "Question: …"` with buttons `A mango`, `B banana`, `C berries` (case follows the bot).
- **Flagged while unanswered.** Run `$C wait <T> --for idle`, then `$C browser click --role button --name "Back"` and `$C browser click --role tab --name "Needs you · 1"`. The Chief thread is listed, and `$C browser wait --role button --name "Chief status: Waiting for your answer"` passes on the field.
- **Answer.** Reopen the thread with `$C browser click --role button --name "Thread: Chief"`, then click the option by its full name from the snapshot, for example `$C browser click --role button --name "B banana"`. The chosen row turns bold with a check. A user bubble `B. banana` appears, and `$C wait <T> --for idle` ends with a reply that uses banana.
- **Approve.** Run `$C browser fill --label "Hand off work" --value "@Careful run this exact bash command: touch approved.txt — then tell me if it worked."` and press Enter. Get `<A>`, then run `$C wait <A> --for approval`. The card `--role group --name "Approval: Bash"` shows `touch approved.txt`. Click `$C browser click --role button --name "Allow"`; `$C browser wait --text "Allowed"` passes as the card flips. After `$C wait <A> --for idle`, `ls <workRoot>/careful/approved.txt` (from `$C paths`) succeeds.
- **Deny.** Repeat with `touch denied.txt` and click `Deny`. `$C browser wait --text "Denied"` passes, the bot says it couldn't run it, and `<workRoot>/careful/denied.txt` does not exist.
- **Persist.** Ask Chief a question as above and leave it open. Start a second Chief thread from the dock with `@Chief reply with only OK`, then `$C wait <T2> --for idle`. `Needs you · 1` still lists the first thread. Needs you is derived from stored messages, so it also survives a server restart (check by restarting the server on the same `FABS_DATA_DIR`; `cleanup` deletes the data). Then type an answer into the first thread's composer instead of tapping: the card's options turn dim and `Needs you` loses its count.
- **Stop.** Ask Careful to `touch stopped.txt` and wait for the approval card. Send a second message `reply with only QUEUED_TURN_RAN`, then click `$C browser click --role button --name "Stop" --exact`. Within a few seconds the card reads `Denied` and `$C wait <S> --for text:Stopped` passes, `stopped.txt` doesn't exist, and `$C thread <S>` never shows `QUEUED_TURN_RAN`.
- **Proof.** Capture `needs-you/question.aria.txt` plus `.png` before answering, `needs-you/answered.aria.txt` after, `needs-you/approval.aria.txt` plus `.png` while pending, and `$C thread` dumps for `<T>` and `<A>`.

## Gotchas

- The decided card's result is a `status` region, which takes no accessible name from its text. Assert it with `--text "Allowed"` or `--text "Denied"`, not `--role status --name`.
- Use `--exact` for short button names like `Stop`. Without it, a field bubble such as `Careful status: Bash touch stopped.txt` matches first.
- After Stop, the last message is the user's queued one, so `wait --for idle` never passes. Wait for `text:Stopped` instead.
- Option buttons are named `<Letter> <option text>`. Read the snapshot for the exact text the bot chose.
- `Needs you` shows a count in its name (`Needs you · 1`) only while something is pending. Match the exact text, or use `--text "Needs you"`.
- Approval cards only come from Claude bots in "ask" mode. A Codex bot in that mode is sandboxed to its desk instead and never shows a card.
- Reads (`Read`, `Grep`, web fetches) never prompt in ask mode. Use a command or a file write to trigger a card.
- An approval blocks the bot's turn until answered. Always click Allow or Deny, or run `cleanup`, so the CLI doesn't hang.
