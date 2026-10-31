# Teamwork

Bots work together. A bot can message a teammate privately and get the reply back mid-task. The user sees it inline in the chat as a card ("Talking with Design…", then "Talked with Design") and can open that card to read the private conversation. Pulling a second bot into a 1:1 chat starts a new group chat with its own sidebar row and leaves the 1:1 as it was; @mentions decide who speaks and show as chips with the bot's face and name. Deleting a thread asks first, naming it and its bots.

## Sub-features

- `team-delegate` makes one bot ask another and use the answer in its own reply.
- `team-exchange` shows the bot-to-bot message as an inline card in the chat, live while the teammate answers.
- `team-backchannel` opens the private thread `<A> ↔ <B>` from that card, and Back returns to the chat.
- `team-group` lists a chat with two or more bots as its own sidebar row with stacked avatars, and its desk panel switches between members.
- `team-pull-in` brings a bot in when it is @mentioned in the composer or chosen from `More` → `Bring in a bot`. From a 1:1 it opens a new, empty group with both bots (an @mention message lands there); in a group it joins in place.
- `team-mention-chips` turns a bot picked from the `@` list into a chip in the composer, and shows every bot @mention in a sent message, from you or a bot, as a chip in the bot's color. Clicking a sent chip opens that bot's 1:1. Mentions in code or links stay plain text.
- `team-mention-exact` wakes exactly the bot on the chip: `@ChiefofStaff` wakes Chief of Staff, never Chief, and `@Chief` in backticks wakes nobody.
- `team-delete` asks before deleting a thread: the dialog names the thread, lists its bots, and says each bot's 1:1 chat stays.

## How to get to it (user POV)

- Ask a bot to consult a teammate ("ask Design for …") in any chat.
- Click the `Exchange with <Bot>` card to read their conversation. It's also listed under `Chats` in either bot's desk panel.
- Type `@Design …` in a chat's composer, or type `@` and pick a bot from the list, or choose `More` → `Bring in a bot`.
- Click a bot's chip in a sent message to open its 1:1.
- Choose `More` → `Delete thread` in any chat.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README. `Chief` and `Design` exist; no `Chief ↔ Design` backchannel yet.
- `claude` is logged in.

- **Delegate.** Run `$C browser click --role button --name "Bot Chief"`, then `$C browser fill --label "Message" --value "Use the message_bot tool to ask Design for three short tagline ideas for a coffee shop, then reply with the one you like best."` and `$C browser press --label "Message" --key Enter`. Get `<T>` with the README eval.
- **Live card.** Immediately run `$C browser wait --role button --name "Exchange with Design" --timeout 120`, then `$C browser screenshot --path teamwork/exchange-live.png --settle 0`. The card reads `Talking with Design…` and Chief's sidebar row reads `Waiting on Design`.
- **Delegation result.** Run `$C wait <T> --for idle`. `$C thread <T>` shows `[tool fabsbot · message_bot done]` and a reply quoting one of Design's taglines. The card now reads `Talked with Design`.
- **Backchannel.** Run `$C browser click --role button --name "Exchange with Design"` and `$C browser wait --role region --name "Thread with Chief ↔ Design"`. It shows Chief's request and Design's answer, each under its author's name. Capture `$C browser snapshot --role region --name "Thread with Chief ↔ Design" --path teamwork/backchannel.aria.txt`. Click `Back`; `Thread with Chief` returns.
- **Group chat.** Open `Bot Careful`, then `$C browser click --role button --name "More"`, `$C browser click --role menuitem --name "Bring in a bot"`, and `$C browser click --role menuitem --name "Design"`. The app opens the new group: `$C browser wait --role region --name "Thread with Careful, Design"` passes, it has no messages, and `Bot Careful` still opens the 1:1 with its greeting. `Open desk` and `$C browser click --role button --name "Show Design"`; `--role complementary --name "Design's desk"` appears.
- **Mention from a 1:1.** Open `Bot Chief`, run `$C browser fill --label "Message" --value "@Design reply with exactly the word: mango"` and press Enter. A new `Thread with Chief, Design` opens; `$C thread` shows the message and Design's reply there, and nothing new in Chief's 1:1.
- **Group turn.** In that chat, run `$C browser fill --label "Message" --value "@Careful @Design each give me one word that describes Monday."` and press Enter. Get `<G>`, run `$C wait <G> --for idle --timeout 240`. `$C thread <G>` shows a reply from Careful followed by one from Design.
- **Mention chip in the composer.** Click `--label "Message"` and run `$C browser press --label "Message" --key "@"`. `--role listbox --name "Mention a bot"` lists every bot with its face. Press `D`, then `Enter`: `[role=textbox][aria-label=Message] [data-mention]` holds a `Design` chip and the draft (`sessionStorage` `draft:<threadId>`) reads `@Design `. `Backspace` twice removes the space, then the whole chip, with no `@` left behind.
- **Send a picked chip.** `browser fill` replaces the whole draft with plain text, so fill the text first, press `Home`, then `@`, `D` and `Enter` to put the chip in front, and `Enter` again to send. The sent message shows `--role button --name "@Design" --exact`.
- **Exact matching.** In a group with Chief and Chief of Staff, send `@ChiefofStaff reply with exactly the word: pineapple`. `$C thread <G>` shows a reply from Chief of Staff only, and the chip reads `@Chief of Staff`. Send `` `@Chief` is only code here. @Design reply with exactly the word: plum ``: only Design answers and the code stays plain.
- **Bot mentions.** Ask `@Design` to hand the floor to Chief using Chief's handle. Design's reply shows `--role button --name "@Chief" --exact` and Chief answers next. Click that chip: `Thread with Chief` (the 1:1) opens.
- **Delete.** In the group, click `More`, then `$C browser click --role menuitem --name "Delete thread"`. `--role dialog` reads `Delete “<title>”?` with `--role list --name "Bots in this thread"`; `Cancel` keeps the thread, `Delete` removes it, and each bot's 1:1 still opens with its history.
- **Proof.** Capture `teamwork/exchange-live.png`, `teamwork/backchannel.aria.txt` plus `.png`, `teamwork/group.aria.txt` plus `.png`, and `$C thread` dumps for `<T>` and `<G>`.

## Gotchas

- The card turns into an exchange only when the call names a known teammate. A malformed `message_bot` call (no `bot`) stays in the work log.
- Inside the backchannel, the teammate's own replies through `message_bot` show as cards too, without a chevron; they would link to the thread you're already in.
- Claude Code has its own `SendMessage`/`ListAgents` tools. Fabs Bot hides them per run. If a bot replies "Design isn't available", that hiding regressed. That's a product bug, not a flaky run.
- Bringing the same bot into a 1:1 twice makes two groups with the same title. Address them by thread id.
- Groups converted in place by older builds stay groups; nothing migrates them.
- Group chats without an @mention run every member in order, each seeing the earlier replies. Allow `--timeout 240`.
- A picked chip sends as the name without spaces (`@ChiefofStaff`). Typed `@Chief of Staff` and `@chief-of-staff` work too. A handle glued to letters, digits or `-` (`a@Chief`, `@Chief-bot`) is not a mention.
- Composer chips render a moment after the edit. Read them in the next command, not in the same `browser eval` that changed the draft.
- Backchannel titles use `↔` (U+2194). Copy it exactly in `--name`.
