# Bot computer

On Linux, every bot also has its own computer: a private, headless KDE desktop (1280×800, no taskbar) with a soft brushed-silver wallpaper that's lightest in the morning and graphite at night. The bot starts programs on it and drives them with the `computer_*` tools, which return screenshots. A bot has only one of its screen and its computer open at a time: opening the computer closes the screen, and the screen can't open again until the computer is closed. The desk keeps a single tile that shows whichever is open: `<Bot>'s computer` while the computer is open, otherwise `<Bot>'s screen`. Open expands it next to the chat, where the user can take control, click and type, and hand it back. The chat header's monitor dot follows the same surface. When something needs the user, the bot posts an amber "Needs you" card with Take over / I'm done / Skip. Nothing it runs reaches the user's real desktop.

## Sub-features

- `computer-tile` turns the desk's single tile into the bot's live desktop with an Open pill and the `<Bot>'s computer` caption while the computer is open. It goes back to `<Bot>'s screen` when the computer closes.
- `computer-one-at-a-time` closes the bot's screen when it opens its computer (logins kept, open pages lost, and the tool result says so), refuses `screen_open` while the computer is open, and refuses `computer_open` while the user has control of the screen.
- `computer-wallpaper` shows a soft brushed-silver wallpaper behind the bot's windows, in the tile, the expanded view and the bot's own screenshots. It has a broad diagonal sheen and fine horizontal brushed streaks, and changes by the PC's clock: deep night 00–06, morning 06–12 (lightest), afternoon 12–18, evening 18–21, night 21–24.
- `computer-dot` puts a dot in the bot's color on the header's `Open desk` button while the bot used its computer in the last 20 s (`<Bot> is using its computer`).
- `computer-expand` opens the desktop beside a narrow chat column with a status chip (`<Bot> is using it` / `Idle` / `You`), `Take control` and `Close computer`; `Back to desk` returns to the tile.
- `computer-control` lets the user click, scroll and type on the desktop; the bot's computer tools are refused while the user has control, and leaving the view hands control back.
- `computer-hand-over` shows the bot's request as a `Computer: <reason>` card; `Take over` opens the computer already in control, `Hand back to <Bot>` or `I'm done` settle it and the bot carries on. The sidebar row reads `Needs you on its computer` until then.
- `computer-close` shuts the desktop and its programs down (`computer_close`, after 30 minutes unused, or when the server stops); the tile goes back to `<Bot>'s screen`.
- `computer-states` shows `Starting…` while it boots. When the PC has no `kwin_wayland` or isn't Linux, the desk only ever shows the screen and the bot isn't offered the computer tools.
- `computer-phone` shows the single tile in the full-screen phone desk and the expanded computer full screen with a status chip and a full-width `Take control`.

## How to get to it (user POV)

- Ask a bot to do something in a desktop app or a native dialog; it starts a program on its computer on its own.
- Open the desk with the monitor button in the chat header; while the computer is open, the tile at the top shows it.
- Click the tile (Open) to watch it large; Take control from there.
- Tap `Take over` on a "Needs you" card in the chat.
- On the phone: chat → monitor button → computer tile → Open.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README on a Linux PC with `kwin_wayland`, `dbus-run-session`, `busctl` and `setsid`, and `claude` logged in. Every Claude bot runs on `claude-haiku-5-5`, including the starter `Chief of Staff`: set its model through `$C api PUT /api/bots/<id>` first.
- An empty `notes.txt` in Chief's desk folder (`$C paths` → `workRoot/chief/`). KWrite and KCalc installed (any KDE install has them).

- **Bot opens and uses a program.** In Chief's chat send `Use computer_open to run: kwrite notes.txt   Then use computer_type to type exactly: Groceries: eggs, milk, bread   Then save with computer_key ctrl+s. Tell me in one short sentence what the window title says. Leave the computer on.` and `$C wait <T> --for idle`. `$C thread <T>` shows `computer_open`, `computer_type` and `computer_key` done, and `workRoot/chief/notes.txt` holds the line.
- **Tile and dot.** Right after the turn, `$C browser count --role img --name "Chief is using its computer"` prints `1`. `$C browser click --role button --name "Open desk"`; the desk's one tile is `region "Chief's computer"` with `Open`, and `$C browser count --role region --name "Chief's screen"` prints `0`. A screenshot shows the brushed-silver wallpaper behind KWrite, and asked to describe its background from `computer_screenshot`, the bot names a brushed-metal texture.
- **Expand.** `$C browser click --role button --name "Open Chief's computer"`. The region `Chief's computer` holds a `status` chip and `Take control`; the chat stays on the right.
- **Take control.** `$C browser click --role button --name "Take control"`; the chip reads `You`. Click in the editor with `$C browser click --selector '[aria-label="Chief'"'"'s computer"] canvas' --at 0.5,0.56`, then `$C browser press --label "Type on Chief's computer" --key End` and `$C browser fill --label "Type on Chief's computer" --value "…"`. A screenshot shows the text in KWrite.
- **Bot waits while you control.** Ask `Use computer_screenshot once and tell me what you see. If it fails, just tell me the error.`; `$C thread <T>` shows `computer_screenshot error "The user has control of your computer right now…"`. `Hand back to Chief` returns the chip to `Idle`.
- **Pixel clicks.** Ask `Use computer_open to run kcalc. Then use computer_click on its buttons to calculate 12+30= (click 1, 2, +, 3, 0, =). Tell me the result.` The reply says 42 after six `computer_click` steps.
- **Hand-over card.** Send `Use computer_hand_over to ask me to add one more grocery item in your KWrite window, then end your turn. When I hand the computer back, use computer_screenshot and tell me which item I added.` and `$C wait <T> --for blocked`. The card `--role group --name "Computer: <reason>"` shows `Needs you`, a live thumbnail, `Take over`, `I'm done`, `Skip`; Chief's sidebar row reads `Needs you on its computer`. `Take over` (`--exact`) opens the computer with the chip at `You`. Type an item, `Hand back to Chief`, then `$C wait <T> --for idle`: the thread has the user line `I'm done on your computer…` and a `computer_screenshot` reply that names the item.
- **Close.** Ask `Save the file with computer_key ctrl+s, then shut down your computer with computer_close.` The file on disk has every edit, the tile is `Chief's screen` again, and no `kwin_wayland --virtual` or `fabs-computer-*` dir under `$XDG_RUNTIME_DIR` is left.
- **One at a time.** Serve or write a small local page, then ask `Use screen_open to open <page> and screen_read it. Then use computer_open to run kcalc. Then try screen_open on the same page again and tell me exactly what each step said.` `$C thread <T>` shows `screen_open` and `screen_read` done, `computer_open` done with a result that says the browser screen was closed, and the second `screen_open` failed with *Only one of your screen and your computer can be open at a time…*. The desk tile moved from `Chief's screen` to `Chief's computer`. Then `computer_close`, ask for `screen_open` again, take control of the screen in the expanded view, and ask for `computer_open`: it fails with *…The user has control of your screen right now, so it stays open…* and the screen stays open.
- **Phone.** `$C browser start --viewport 430x932`, open Chief's chat while its computer is open, `Open desk`, then `Open Chief's computer`. The desk shows the one tile; the expanded computer fills the phone with `Take control` at the bottom.
- **No KWin.** `$C server stop` then `FABS_KWIN=/nonexistent $C server start`. The desk shows only `Chief's screen`, and asked to list its `computer_` and `screen_` tools without calling any, a fresh chat's bot names only `screen_*` ones.
- **Proof.** ARIA snapshot plus screenshot of the desk tile while the computer is open, the expanded computer with its wallpaper, control taken, the hand-over card pending and settled, the one-at-a-time thread, the phone views and the KWin-missing desk, plus `$C thread <T>` and the file on disk.

## Gotchas

- The desktop streams pixels into a `<canvas>`; ARIA snapshots can't see it. Prove what it shows with screenshots or the bot's reply about its `computer_screenshot`.
- Clicks inside the desktop need `--at x,y` on the canvas; fractions are of the canvas box, which matches the 1280×800 desktop.
- The computer's file dialogs open on the real home folder. Don't screenshot one for evidence; keep the work in the bot's desk folder.
- Typing only covers characters on a US keyboard. Text with others (é, emoji) is refused before anything is typed.
- Each bot's desktop keeps its own app settings under the instance's data dir in `computers/<botId>`, which goes away with `cleanup`.
- A server stop closes the computer, so the tile goes back to `Chief's screen` rather than reading `Last seen …`.
- The wallpaper follows the server's clock in five steps, so screenshots taken at different times of day differ in shade. To see another step, `$C server stop` then `TZ=<zone> $C server start` with a zone whose local hour falls in it.
- A resumed chat can still list `computer_*` tools from its own history when KWin goes missing; check tool lists in a fresh chat.
