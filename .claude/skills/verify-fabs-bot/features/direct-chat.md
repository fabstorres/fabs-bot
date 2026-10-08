# Direct chat

A user hands one bot a piece of work. Clicking a bot in the sidebar opens its chat in the main pane. The bot works in its own desk folder on the PC, the user watches it live (sidebar status line, avatar motion, typing dots, work log), and the result comes back as a reply and, when it makes something, as a file the user can open from any device. The desk panel beside the chat lists the bot's files and routines. The thread persists across reloads.

## Sub-features

- `chat-open` opens a bot's direct chat from its sidebar row.
- `chat-compose` sends from the composer.
- `chat-live` shows the bot working: status text in its sidebar row, typing dots, a work log of tool steps.
- `chat-file` shows a shared file as a card that opens in a preview dialog.
- `chat-desk` lists the same file in the desk panel, and it exists on disk.
- `chat-routines` lists the bot's routines in the desk panel, with their schedule or `Paused`.
- `chat-persist` keeps the thread and its file after a reload.
- `chat-phone` shows the bot list first on a phone, opens the chat full screen, and Back returns to the list.

## How to get to it (user POV)

- Click the bot's row in the sidebar, then type in the composer.
- On a phone, tap the bot's big face at the top or its row in the list.
- Open the desk with the monitor button (`Open desk`) in the chat header.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README.
- `claude` is logged in (`$C doctor` lists `claude`).

- **Open and send.** Run `$C browser click --role button --name "Bot Chief"` and `$C browser wait --role region --name "Thread with Chief"`. Run `$C browser fill --label "Message" --value "Write a file named haiku.md in your desk with a 3-line haiku about coffee, share it with share_file, then reply with one short sentence."` and `$C browser press --label "Message" --key Enter`. The message shows as a black bubble.
- **Grab the thread id.** Run `$C browser eval "document.querySelector('[role=region][data-thread-id]').dataset.threadId"`. It prints a UUID; use it as `<T>`.
- **Watch it work.** Right away, run `$C browser text --role button --name "Bot Chief"`. While the turn runs, the row's preview line shows what Chief is doing instead of its last message. Fast turns can finish before this; that's a gotcha, not a failure.
- **Shared file arrives.** Run `$C wait <T> --for file` then `$C wait <T> --for idle`. Run `$C thread <T>`. The dump shows `[tool fabsbot · share_file done] [file haiku.md …]` and a closing sentence.
- **Open the file.** Run `$C browser click --role button --name "File haiku.md"` and `$C browser wait --role dialog --name "haiku.md"`. The preview shows the haiku on three lines. Close it with `$C browser press --role dialog --name "haiku.md" --key Escape`.
- **Desk and disk.** Run `$C browser click --role button --name "Open desk"`, then `$C browser snapshot --role complementary --name "Chief's desk" --path direct-chat/desk.aria.txt`. The snapshot contains `button "File haiku.md"`. Read `$C paths` → `workRoot`, then `cat <workRoot>/chief/haiku.md`; the haiku is on disk.
- **Routines.** Seed one with `$C api POST /api/routines '{"botId":"<chief id>","name":"Morning briefing","cron":"0 8 * * *","prompt":"Brief me"}'` and a paused one with `"enabled":false`. Reopen the desk; `--role group --name "Routine Morning briefing"` reads `Every day at 8:00 AM` and the paused one reads `Paused`.
- **Persistence.** Run `$C browser open /`, `$C browser click --role button --name "Bot Chief"`, and `$C browser wait --role button --name "File haiku.md"`. The thread and its file card survive the reload.
- **Phone.** Run `$C browser start --viewport 430x932` and `$C browser open /`. The list shows big faces (`Open Chief`) above the rows. Click `Bot Chief`; the chat fills the screen. `Open desk` opens the desk full screen; `Close desk` and then `Back` return to the list (`$C browser count --role region --name "Thread with Chief"` prints `0`).
- **Proof.** Capture `$C browser snapshot --role region --name "Thread with Chief" --path direct-chat/thread.aria.txt`, `$C browser screenshot --path direct-chat/thread.png`, the viewer pair, the desk pair, the phone list and chat pairs, and `$C thread <T> > .verify/artifacts/<run>/direct-chat/thread.txt`.

## Gotchas

- Bots sometimes answer in prose instead of calling the tool you asked for. If `$C thread` lacks `fabsbot · share_file`, that drive failed. Rephrase ("use the share_file tool") and retry.
- Claude loads app tools lazily, so the first turn of a session is slower. Give `wait` 150 s.
- The live status line exists only while the bot works. Read it right after sending, or skip it with a note; don't fail the feature on it.
- The file card in chat and the desk entry share the name `File haiku.md`. Scope desk assertions to `--role complementary --name "Chief's desk"`.
- `browser start` restarts Chromium. Switching to the phone viewport drops the open chat; reopen it.
- Clicking a bot opens its direct thread (the most recent one if a routine made others). Other threads with the bot are listed under `Chats` in its desk panel.
- The desk panel only lists routines; add or delete them in the bot's settings (gear).
