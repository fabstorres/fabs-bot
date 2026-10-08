# Teamwork

Bots work together. A bot can message a teammate privately and get the reply back mid-task. The user sees it inline in the chat as a card ("Talking with Design…", then "Talked with Design") and can open that card to read the private conversation. Pulling a second bot into a chat turns it into a group chat, which gets its own sidebar row; @mentions decide who speaks.

## Sub-features

- `team-delegate` makes one bot ask another and use the answer in its own reply.
- `team-exchange` shows the bot-to-bot message as an inline card in the chat, live while the teammate answers.
- `team-backchannel` opens the private thread `<A> ↔ <B>` from that card, and Back returns to the chat.
- `team-group` lists a chat with two or more bots as its own sidebar row with stacked avatars, and its desk panel switches between members.
- `team-pull-in` adds a bot to an existing chat when it is @mentioned in the composer or chosen from `More` → `Bring in a bot`.

## How to get to it (user POV)

- Ask a bot to consult a teammate ("ask Design for …") in any chat.
- Click the `Exchange with <Bot>` card to read their conversation. It's also listed under `Chats` in either bot's desk panel.
- Type `@Design …` in a chat's composer, or choose `More` → `Bring in a bot`.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README. `Chief` and `Design` exist; no `Chief ↔ Design` backchannel yet.
- `claude` is logged in.

- **Delegate.** Run `$C browser click --role button --name "Bot Chief"`, then `$C browser fill --label "Message" --value "Use the message_bot tool to ask Design for three short tagline ideas for a coffee shop, then reply with the one you like best."` and `$C browser press --label "Message" --key Enter`. Get `<T>` with the README eval.
- **Live card.** Immediately run `$C browser wait --role button --name "Exchange with Design" --timeout 120`, then `$C browser screenshot --path teamwork/exchange-live.png --settle 0`. The card reads `Talking with Design…` and Chief's sidebar row reads `Waiting on Design`.
- **Delegation result.** Run `$C wait <T> --for idle`. `$C thread <T>` shows `[tool fabsbot · message_bot done]` and a reply quoting one of Design's taglines. The card now reads `Talked with Design`.
- **Backchannel.** Run `$C browser click --role button --name "Exchange with Design"` and `$C browser wait --role region --name "Thread with Chief ↔ Design"`. It shows Chief's request and Design's answer, each under its author's name. Capture `$C browser snapshot --role region --name "Thread with Chief ↔ Design" --path teamwork/backchannel.aria.txt`. Click `Back`; `Thread with Chief` returns.
- **Group chat.** Open `Bot Careful`, then `$C browser click --role button --name "More"`, `$C browser click --role menuitem --name "Bring in a bot"`, and `$C browser click --role menuitem --name "Design"`. `$C browser wait --role button --name "Thread: Careful, Design"` passes. Click it, then `Open desk` and `$C browser click --role button --name "Show Design"`; `--role complementary --name "Design's desk"` appears.
- **Group turn.** In that chat, run `$C browser fill --label "Message" --value "@Careful @Design each give me one word that describes Monday."` and press Enter. Get `<G>`, run `$C wait <G> --for idle --timeout 240`. `$C thread <G>` shows a reply from Careful followed by one from Design.
- **Proof.** Capture `teamwork/exchange-live.png`, `teamwork/backchannel.aria.txt` plus `.png`, `teamwork/group.aria.txt` plus `.png`, and `$C thread` dumps for `<T>` and `<G>`.

## Gotchas

- The card turns into an exchange only when the call names a known teammate. A malformed `message_bot` call (no `bot`) stays in the work log.
- Inside the backchannel, the teammate's own replies through `message_bot` show as cards too, without a chevron; they would link to the thread you're already in.
- Claude Code has its own `SendMessage`/`ListAgents` tools. Fabs Bot hides them per run. If a bot replies "Design isn't available", that hiding regressed. That's a product bug, not a flaky run.
- Pulling a bot into a direct chat converts that chat into the group chat; the first bot's row then has no direct chat until you open it again.
- Group chats without an @mention run every member in order, each seeing the earlier replies. Allow `--timeout 240`.
- Bot names with spaces are mentioned without spaces (`@ChiefofStaff`). The mention menu inserts that form.
- Backchannel titles use `↔` (U+2194). Copy it exactly in `--name`.
