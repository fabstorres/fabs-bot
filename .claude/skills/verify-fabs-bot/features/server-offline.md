# Server offline

When a window loses its connection to the PC's Fabs Bot server, a banner above the composer says so, and the composer and the question and approval cards wait until it is back. Other controls, such as desk settings, `Run <name> now`, the thread menu and New bot, don't wait and still send their requests. Typing still works and nothing typed is lost. Short blips don't show the banner, the app retries on its own, and it retries at once when the device comes back online or the tab becomes visible again.

## Sub-features

- `offline-reconnecting` shows `<PC> is reconnecting` and a `Reconnect` button above the composer, held back 2 s so a blip doesn't flash it. `Fabs Bot on <PC> did not answer` appears under the title once a retry fails, so the banner can show the title alone at first. `Reconnect` skips the remaining backoff and retries at once.
- `offline-blocked` disables Send (named `Environment disconnected` while offline), Attach, Stop, question options and Allow / Deny at once, with no grace. Disabled question options are dimmed like a disabled button, and so are answered ones. The message box and Dictate keep working.
- `offline-enter` refuses Enter with the toast `Not connected: message not sent` and keeps the draft.
- `offline-recover` clears the banner on its own once the server answers. The kept draft then sends.
- `offline-device` shows `<PC> is offline` with `This device is offline` and a `Reconnect` button when the device loses its network and a quick check of the PC then fails, and reconnects as soon as it is back.
- `offline-latest-wins` makes Reconnect, coming back online and going offline act at once even while an earlier attempt is still waiting. An older health check that fails late never drops a connection a newer check confirmed.
- `offline-send-failed` puts a message whose send failed back in the composer ahead of any newer draft, with its attachments next to any new ones.
- `offline-first-load` shows a full-screen `Fabs Bot is reconnecting` / `Fabs Bot did not answer` notice with `Reconnect` when the app opens while the server doesn't answer. It never tells the user to run a command.

## How to get to it (user POV)

- The PC's Fabs Bot quits, restarts or loses its network while a chat is open.
- The device itself goes offline (Wi-Fi off, airplane mode).
- The app is opened while the PC doesn't answer.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README, with `Thread with Chief` open.
- For `offline-device` and `offline-first-load`: a Node script that stays connected to the run's browser (`browser.cdpPort` in the run's `state.json`) through `playwright-core`'s `chromium.connectOverCDP`.

- **Server goes away.** Run `$C server stop`. Right away `$C browser wait --role button --name "Environment disconnected"` passes and `--role alert` is absent. About 2 s later `$C browser wait --role alert` passes. Once the first retry fails, `$C browser wait --text "did not answer"` passes and `$C browser text --role alert` reads `<pc> is reconnecting` / `Fabs Bot on <pc> did not answer`.
- **Enter is refused.** Run `$C browser fill --label "Message" --value "Are you still there?"` and `$C browser press --label "Message" --key Enter`. `$C browser wait --text "Not connected: message not sent"` passes, and `$C browser eval "document.querySelector('[role=textbox][aria-label=Message]').textContent"` still prints the draft.
- **Reconnect while reconnecting.** With the server still stopped, `$C browser click --role button --name "Reconnect"` sends a new `/api/host` request at once and the banner stays. Run `$C server start` and click `Reconnect` again: the banner clears right away instead of waiting for the next retry.
- **Server comes back.** Run `$C server start`, then `$C browser wait --role alert --state hidden --timeout 60`. `$C browser click --role button --name "Send"` sends the kept draft, and it survives `$C browser open /`.
- **Device offline.** In the script, `await context.setOffline(true)`. The page checks the PC, and once that check fails it shows `--role alert` with `This device is offline` and a `Reconnect` button. Chromium's offline emulation fails the check at once. `await context.setOffline(false)` clears it within a second.
- **First load.** In the script, `await page.route("**/api/host", (r) => r.abort("connectionrefused"))` and reload. The page shows `Fabs Bot is reconnecting`, `Fabs Bot did not answer` and `Reconnect`, and no `bun run`. `await page.unroute("**/api/host")`, then click `Reconnect` straight away: the app loads.

- **Latest attempt wins.** In the script, hold `**/api/host` requests with `page.route` (keep the `route` objects instead of answering them). Hold one automatic retry on the first-load notice, let later requests through, and click `Reconnect`: the app loads at once. While connected, dispatch `online` twice with the first probe held and the second answered, then abort the held one: no banner, and Attach stays enabled.
- **Failed send.** In the script, hold the `POST` to `**/api/threads/*/messages`, type a newer draft and attach another file, then abort the held request. The composer shows the failed message, then the newer draft, with both attachments.

## Gotchas

- While the server is stopped, its port is free, and another run's `$C launch` can take it. Launch with `--port N`, choosing a high N where N and N+1 are free, so the port sits outside the range other runs pick from. `$C server start` refuses a port that is already taken.
- `$C server stop` also kills any bot CLI mid-turn. After `$C server start` the cut-off reply shows as failed.
- Each retry waits a random time in a doubling range (1–2 s, 2–4 s, 4–8 s …) that tops out at 150–300 s. While disconnected, clicking `Reconnect`, the device coming back online, or the tab becoming visible starts over from the first range and retries at once. A drop after a connection that held for 30 s also starts over. A drop sooner than that keeps counting, so a second `server stop` right after reconnecting waits longer and shows the banner title alone for a few seconds. Keep the server down briefly, or click `Reconnect` after `server start`, or the banner can take a while to clear.
- A scheduled retry can load the app before a delayed `Reconnect` click on the first-load notice. Click it right after `unroute`.
- Chromium's offline emulation ends when the CDP client disconnects, so the one-shot `$C browser …` commands can't hold a device offline.
- The banner shows the PC's own name, which is usually its Tailscale machine name. `$C browser screenshot` masks it and snapshots redact it to `<pc>`, but a CDP screencast skips those masks: inject your own mask before recording.
