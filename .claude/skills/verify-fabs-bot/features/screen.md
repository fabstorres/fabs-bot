# Bot screen

Every bot has its own screen: a headless Chromium on the PC that runs Fabs Bot, which the bot drives with the `screen_*` tools and the user watches from any device. The desk panel starts with a `<Bot>'s screen` tile showing the live page with an Open pill. Open expands it next to the chat, where the user can take control, click and type on the page, and hand it back. The chat header's monitor button gets a dot in the bot's color while the bot is using its screen. When a page needs the user (a sign-in, a CAPTCHA), the bot posts an amber "Needs you" card with Take over / I'm done / Skip. Each bot keeps its own logins between chats and after its screen closes.

## Sub-features

- `screen-tile` shows the bot's live page in the desk with an Open pill and the `<Bot>'s screen` caption; `Nothing open` with a sleepy avatar when closed.
- `screen-dot` puts a dot in the bot's color on the header's `Open desk` button while the bot used its screen in the last 20 s.
- `screen-expand` opens the screen beside a narrow chat column with the address, a status chip (`<Bot> is using it` / `Idle` / `You`), `Take control` and `Close screen`; `Back to desk` returns to the tile.
- `screen-control` lets the user click, scroll and type on the page; the bot's screen tools are refused while the user has control, and leaving the view hands control back.
- `screen-hand-over` shows the bot's request as a card; `Take over` opens the screen already in control, `Hand back to <Bot>` or `I'm done` settle it and the bot carries on, `Skip` tells the bot to go without it. The sidebar row reads `Needs you on its screen` with the `Needs you` dot until then.
- `screen-logins` keeps a bot's cookies and storage in its own profile, across chats and after `screen_close`.
- `screen-states` shows `Loading` with the address, `Last seen …` dimmed when the PC is unreachable, and `No Chromium browser found` when the PC has no Chrome, Chromium, Edge or Brave.
- `screen-phone` shows the tile in the full-screen phone desk and the expanded screen full screen with a status chip and a full-width `Take control`.

## How to get to it (user POV)

- Ask a bot to do something in a browser; it opens its screen on its own.
- Open the desk with the monitor button in the chat header; the tile is at the top.
- Click the tile (Open) to watch it large; Take control from there.
- Tap `Take over` on a "Needs you" card in the chat.
- On the phone: chat → monitor button → tile → Open.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README, with `claude` logged in. Bots run on `claude-haiku-5-5`.
- A page to browse on this PC. Serve a small site, for example a folder with `index.html` (a heading and a `Sign in` link), `signin.html` (email and password fields that redirect to `dashboard.html`) and `dashboard.html` (prints who signed in from `localStorage`): `python3 -I -m http.server 5199 --bind 127.0.0.1` from that folder.

- **Bot opens a page.** In Chief's chat send `Use screen_open to open localhost:5199 on your screen, then screen_read it and tell me the main heading in one short sentence. Leave the page open.` and `$C wait <T> --for idle`. `$C thread <T>` shows `[tool fabsbot · screen_open done] [tool fabsbot · screen_read done]` and the heading.
- **Tile and dot.** `$C browser click --role button --name "Open desk"`, then `$C browser wait --role region --name "Chief's screen"`. Within 20 s of the turn, `$C browser count --role img --name "Chief is using its screen"` prints `1`. Screenshot the desk.
- **Expand.** `$C browser click --role button --name "Open Chief's screen"`. The region `Chief's screen` holds `Address` (`localhost:5199`), a `status` chip and `Take control`; the chat stays on the right.
- **Take control.** `$C browser click --role button --name "Take control"`; the status chip reads `You`. Click inside the page with `$C browser click --selector '[aria-label="Chief'"'"'s screen"] canvas' --at <x>,<y>` (fractions of the page, for example the `Sign in` link). Type with `$C browser fill --label "Type on Chief's screen" --value "…"` and keys with `$C browser press --label "Type on Chief's screen" --key Tab|Enter`. A screenshot shows the page change.
- **Bot waits while you control.** With control taken, ask the bot to click something on its screen; `$C thread <T>` shows the screen tool `error "The user has control of your screen right now…"`. `$C browser click --role button --name "Hand back to Chief"`; the chip returns to `Idle`.
- **Hand-over card.** Send `Open localhost:5199/signin.html on your screen, then use screen_hand_over to ask me to sign in, and end your turn. When I hand it back, screen_read and tell me who is signed in.` and `$C wait <T> --for blocked` (or `--for screen`). The card `--role group --name "Screen: <reason>"` shows `Needs you`, a live thumbnail, `Take over`, `I'm done`, `Skip`; Chief's sidebar row reads `Needs you on its screen`. Click `$C browser click --role button --name "Take over" --exact`; the screen opens with the chip at `You`. Sign in, click `Hand back to Chief`, then `$C wait <T> --for idle`. `$C thread <T>` shows `[screen "<reason>" done]`, the user line `I'm done on your screen…` and a `screen_read` that names the signed-in email.
- **Logins survive.** Send `Use screen_close to close your screen. Then screen_open localhost:5199/dashboard.html, screen_read it, and tell me who is signed in.` The reply names the same email.
- **Phone.** `$C browser start --viewport 430x932`, open Chief's chat, `Open desk`, then `Open Chief's screen`. The expanded screen fills the phone with `Take control` at the bottom.
- **Offline.** With the tile showing a page, `$C server stop`; within a few seconds the tile dims and reads `Last seen …`. `$C server start` brings it back (the screen itself closed with the server, so it reads `Nothing open`).
- **No Chromium.** `$C server stop` then `FABS_CHROMIUM=/nonexistent $C server start`. The tile reads `No Chromium browser found` and a `screen_open` comes back as a failed step that says to install Chrome or Chromium.
- **Proof.** ARIA snapshot plus screenshot of the desk tile, the expanded screen, control taken, the hand-over card pending and settled, and the phone views, plus `$C thread <T>`.

## Gotchas

- The screen streams pixels into a `<canvas>`; ARIA snapshots can't see the page itself. Prove what the page shows with screenshots or the bot's `screen_read`.
- Clicks inside the page need `--at x,y` on the canvas; fractions are of the canvas box, which matches the 1280×800 page.
- `browser fill` on `Type on Chief's screen` sends text as typed input. It works only while you have control.
- A Chromium launched for a test bot shares nothing with the user's browser. Profiles live under the instance's data dir in `screens/<botId>` and go away with `cleanup`.
- The dot shows for 20 s after the bot's last screen action. Count it right after the turn, or not at all.
- Haiku sometimes calls `screen_hand_over` without a reason. The tool refuses that and the bot retries, so expect one failed step before the card.
- Leaving the expanded view while in control hands control back. `Take over` from a card takes control again on open.
- Each tile, card thumbnail and expanded view opens its own `/screen` socket; the browser only streams while one is open.
