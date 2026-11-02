# Teamwork

Bots work together. A bot can message a teammate privately and get the reply back mid-task. The user sees it inline in the chat as a card ("Talking with Design…", then "Talked with Design") and can open that card to read the private conversation. Pulling a second bot into a 1:1 chat starts a new group chat with its own sidebar row and leaves the 1:1 as it was; @mentions decide who speaks and show as chips with the bot's face and name. Deleting a thread asks first, naming it and its bots.

## Sub-features

- `team-delegate` makes one bot ask another and use the answer in its own reply.
- `team-exchange` shows the bot-to-bot message as an inline card in the chat, live while the teammate answers.
- `team-backchannel` opens the private thread `<A> ↔ <B>` from that card, and Back returns to the chat.
- `team-group` lists a chat with two or more bots as its own sidebar row with stacked avatars, and its desk panel switches between members.
- `team-pull-in` brings a bot in when it is picked from the `@` list in the composer or chosen from `More` → `Bring in a bot`. From a 1:1 it opens a new, empty group with both bots (an @mention message lands there); in a group it joins in place.
- `team-mention-chips` turns a bot picked from the `@` list into a chip in the composer, and shows every bot @mention in a sent message, from you or a bot, as a chip in the bot's color. Clicking a sent chip opens that bot's 1:1. Mentions in code or links stay plain text.
- `team-mention-exact` wakes exactly the bot on the chip: a `Chief` chip followed by typed ` of Staff` wakes Chief, never Chief of Staff, and typed `@Chief` text wakes nobody.
- `team-start-group` lets a bot open a new group with the user, itself and named teammates (`start_group`) after the user taps Allow on an approval card. The chat it was asked in stays as it was.
- `team-invite` lets a bot in a group add a teammate to that group (`invite_bot`) after the user taps Allow. The teammate joins silently and answers once handed the floor. Outside a group the bot is told to use `start_group`.
- `team-delete` asks before deleting a thread: the dialog names the thread, lists its bots, and says each bot's 1:1 chat stays.

## How to get to it (user POV)

- Ask a bot to consult a teammate ("ask Design for …") in any chat.
- Click the `Exchange with <Bot>` card to read their conversation. It's also listed under `Chats` in either bot's desk panel.
- Type `@` in a chat's composer and pick a bot from the list, or choose `More` → `Bring in a bot`.
- Ask a bot to start a group with teammates ("start a group with Design and Engineer called Launch plan"), or, in a group, to add a teammate ("add Careful to this chat"). Allow or Deny the card.
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
- **Mention from a 1:1.** Open `Bot Chief`, run `$C browser fill --label "Message" --value "reply with exactly the word: mango"`, press `Home`, then `@`, `D`, `Enter` to put a `Design` chip in front, and `Enter` to send. A new `Thread with Chief, Design` opens; `$C thread` shows the message and Design's reply there, and nothing new in Chief's 1:1.
- **Group turn.** Open `Thread with Careful, Design`, fill `each give me one word that describes Monday.`, press `Home`, pick `Careful` (`@`, `Ca`, `Enter`) and `Design` (`@`, `D`, `Enter`), then press `Enter` to send. Get `<G>`, run `$C wait <G> --for idle --timeout 240`. `$C thread <G>` shows a reply from Careful followed by one from Design.
- **Mention chip in the composer.** Click `--label "Message"` and run `$C browser press --label "Message" --key "@"`. `--role listbox --name "Mention a bot"` lists every bot with its face. Press `D`, then `Enter`: `[role=textbox][aria-label=Message] [data-mention]` holds a `Design` chip and the draft (`sessionStorage` `draft:<threadId>`) reads `<@<Design's id>> `. `Backspace` twice removes the space, then the whole chip, with no `@` left behind.
- **Send a picked chip.** `browser fill` replaces the whole draft with plain text, so fill the text first, press `Home`, then `@`, `D` and `Enter` to put the chip in front, and `Enter` again to send. The sent message shows `--role button --name "@Design" --exact`.
- **Exact matching.** In a group with Chief and Chief of Staff, fill ` of Staff, reply with exactly the word: kiwi.`, press `Home`, type `@`, `Chief`, move to `--role option --name "Chief" --exact` with the arrow keys and press `Enter`, then `Enter` to send. `$C thread <G>` shows a reply from Chief only, and the sent chip reads `@Chief`. Send `` `@Chief` is only code here. `` followed by a picked `Design` chip and `reply with exactly the word: plum`: only Design answers and the code stays plain.
- **Bot mentions.** Ask `@Design` to hand the floor to Chief using Chief's handle. Design's reply shows `--role button --name "@Chief" --exact` and Chief answers next. Click that chip: `Thread with Chief` (the 1:1) opens.
- **Bot starts a group.** In `Thread with Chief`, send `Use the start_group tool to start a group with Design and Engineer called Launch plan. Then tell me the result in one sentence.` After `$C wait <T> --for approval`, `--role group --name "Approval: start_group"` reads `Start "Launch plan" with Design, Engineer`. Click `Allow`: `--role button --name "Thread: Launch plan"` appears in the sidebar, `$C api GET /api/threads` shows it as a `group` with Chief, Design and Engineer and no messages, and Chief's 1:1 still has only Chief. Repeat with another title and click `Deny`: Chief says it was declined and no group appears.
- **Bot invites a teammate.** In a group without Careful, pick `Design` from the `@` list and send `use invite_bot to add Careful, then ask Careful by handle to reply with exactly: pear`. Allow `--role group --name "Approval: invite_bot"`. The group gains Careful once (`$C api GET /api/threads`), and Careful replies `pear` after Design hands it the floor.
- **Invite refusals.** Ask a bot to call `invite_bot` from its 1:1 (it's told to use `start_group`), with an unknown name, with a member's name, with its own name, and with a name two bots share (`Ops Bot` and `Ops-Bot` both answer to `ops-bot`). Each returns a clear result and shows no approval card.
- **Delete.** In the group, click `More`, then `$C browser click --role menuitem --name "Delete thread"`. `--role dialog` reads `Delete “<title>”?` with `--role list --name "Bots in this thread"`; `Cancel` keeps the thread, `Delete` removes it, and each bot's 1:1 still opens with its history.
- **Proof.** Capture `teamwork/exchange-live.png`, `teamwork/backchannel.aria.txt` plus `.png`, `teamwork/group.aria.txt` plus `.png`, and `$C thread` dumps for `<T>` and `<G>`.

## Gotchas

- The card turns into an exchange only when the call names a known teammate. A malformed `message_bot` call (no `bot`) stays in the work log.
- Inside the backchannel, the teammate's own replies through `message_bot` show as cards too, without a chevron; they would link to the thread you're already in.
- Claude Code has its own `SendMessage`/`ListAgents` tools. Fabs Bot hides them per run. If a bot replies "Design isn't available", that hiding regressed. That's a product bug, not a flaky run.
- Bringing the same bot into a 1:1 twice makes two groups with the same title. Address them by thread id.
- Groups converted in place by older builds stay groups; nothing migrates them.
- Group chats without an @mention run every member in order, each seeing the earlier replies. Allow `--timeout 240`.
- A picked chip sends as `<@<botId>>`, so `$C thread` shows ids, not names. Typed `@Name` text, `browser fill` included, stays plain and wakes nobody; in a group that means every member answers in turn.
- Bots read mentions as handles (`@ChiefofStaff`) and write handles back. A bot's handle becomes `<@<botId>>` when its turn ends, so its chip appears only after the reply finishes streaming. A handle glued to letters, digits or `-` (`a@Chief`, `@Chief-bot`) is not a mention.
- Messages sent before mentions used ids keep their `@Name` text as plain text.
- Composer chips render a moment after the edit. Read them in the next command, not in the same `browser eval` that changed the draft.
- `start_group` and `invite_bot` ask for approval even from full-autonomy bots. Haiku sometimes calls them once with guessed arguments first; that call returns a hint and shows no card.
- A new member's sidebar row and the group's title update live; the group itself has no message announcing the join.
- Backchannel titles use `↔` (U+2194). Copy it exactly in `--name`.
