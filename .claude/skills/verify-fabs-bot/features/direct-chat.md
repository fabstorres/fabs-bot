# Direct chat

A user hands one bot a piece of work. The bot works in its own desk folder on the PC, the user watches it live (status bubble, work log), and the result comes back as a reply and, when it makes something, as a file the user can open from any device. The thread persists across reloads.

## Sub-features

- `chat-dock` starts a new thread with the bot @mentioned in the dock.
- `chat-compose` continues an existing thread from its composer.
- `chat-live` shows the bot working: field status bubble, typing dots, a work log of tool steps.
- `chat-file` shows a shared file as a chip that opens in a preview dialog.
- `chat-desk` lists the same file in the bot's desk, and it exists on disk.
- `chat-persist` keeps the thread and its file after a reload.
- `chat-phone` reaches a bot from the bot strip on a phone-sized screen.

## How to get to it (user POV)

- Type `@Chief …` in the dock at the bottom of the field and press Enter.
- Double-click a bot on the field, or click it and choose `Chat` in its card.
- Choose a row in the Inbox, then type in the composer.
- On a phone, tap the bot in the strip under the top bar.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README, with no existing thread for `Chief`.
- `claude` is logged in (`$C doctor` lists `claude`).

- **Hand off from the dock.** Run `$C browser fill --label "Hand off work" --value "@Chief write a file named haiku.md in your desk with a 3-line haiku about coffee, share it with share_file, then reply with one short sentence."` and `$C browser press --label "Hand off work" --key Enter`. Run `$C browser wait --role region --name "Thread with Chief"`. The sheet opens with the message as a black bubble.
- **Grab the thread id.** Run `$C browser eval "document.querySelector('[role=region][data-thread-id]').dataset.threadId"`. It prints a UUID; use it as `<T>`.
- **Watch it work.** Run `$C browser click --role button --name "Back"`, then `$C browser wait --role button --name "Chief status:" --timeout 20`. A bubble above Chief on the field says what it is doing. Fast turns can finish before this; that's a gotcha, not a failure.
- **Shared file arrives.** Run `$C wait <T> --for file` then `$C wait <T> --for idle`. Run `$C thread <T>`. The dump shows `[tool fabsbot · share_file done] [file haiku.md …]` and a closing sentence.
- **Open the file.** Reopen the thread (`$C browser click --role button --name "Thread: Chief"`), then run `$C browser click --role button --name "File haiku.md"` and `$C browser wait --role dialog --name "haiku.md"`. The preview shows the haiku on three lines.
- **Desk and disk.** Press `$C browser press --key Escape`, run `$C browser click --role button --name "Open desk"`, then `$C browser snapshot --role dialog --name "Chief's desk" --path direct-chat/desk.aria.txt`. The snapshot contains `button "File haiku.md"`. Read `$C paths` → `workRoot`, then `cat <workRoot>/chief/haiku.md`; the haiku is on disk.
- **Persistence.** Run `$C browser open /`, `$C browser click --role button --name "Thread: Chief"`, and `$C browser wait --role button --name "File haiku.md"`. The thread and its file chip survive the reload.
- **Continue from the composer.** Run `$C browser fill --label "Message" --value "Now add a title line to haiku.md and share it again."`, `$C browser press --label "Message" --key Enter`, then `$C wait <T> --for idle`. `$C thread <T>` shows a second user message and a second file part.
- **Phone entry.** Run `$C browser start --viewport 430x932`, `$C browser open /`, and `$C browser click --role button --name "Chat with Chief"`. The sheet fills the screen with the same thread.
- **Proof.** Capture `$C browser snapshot --role region --name "Thread with Chief" --path direct-chat/thread.aria.txt`, `$C browser screenshot --path direct-chat/thread.png`, the viewer pair (`direct-chat/file-viewer.aria.txt`, `.png`), and `$C thread <T> > .verify/artifacts/<run>/direct-chat/thread.txt`.

## Gotchas

- Bots sometimes answer in prose instead of calling the tool you asked for. If `$C thread` lacks `fabsbot · share_file`, that drive failed. Rephrase ("use the share_file tool") and retry.
- Claude loads app tools lazily, so the first turn of a session is slower. Give `wait` 150 s.
- The status bubble exists only while the bot works. Assert it right after sending, or skip it with a note; don't fail the feature on it.
- The file chip and the desk entry share the name `File haiku.md`. Scope desk assertions to `--role dialog --name "Chief's desk"`.
- `browser start` restarts Chromium. Switching to the phone viewport drops the open sheet; reopen the thread.
- A thread opened from the field or inbox is the bot's single direct thread. The dock always creates a new one.
