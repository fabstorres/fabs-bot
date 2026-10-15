# Desktop app

`bun run desktop` opens straight into a PC: the last saved PC opened, else the newest paired, else `This PC`. The launcher, listing `This PC` and saved PCs, only shows from `File → Switch PC…` or when the chosen PC doesn't answer. Opening a PC shows its Fabs Bot in its own window. This is how a laptop works with the bots on another PC over the tailnet. Adding a PC takes its pairing link (or its Tailscale HTTPS address). The app remembers the PC, reopens it on the next start, and stays signed in. `File → Switch PC…` returns to the launcher. Pages from a PC can't reach the launcher or its controls.

## Sub-features

- `desktop-launcher` lists This PC and saved PCs, and adds a PC from a link.
- `desktop-first-run` opens This PC on a fresh start, without the launcher.
- `desktop-startup` prefers a saved PC over This PC, even when This PC was opened last.
- `desktop-local` opens This PC when its server is running.
- `desktop-remote-pair` pairs with another PC from its pairing link and shows its bots.
- `desktop-remember` reopens the last PC after a restart, still signed in.
- `desktop-switch` goes back to the launcher from the menu.
- `desktop-forget` forgets a PC and its sign-in; adding it again needs pairing.
- `desktop-unreachable` refuses a link that doesn't answer, without saving it.
- `desktop-isolation` keeps the launcher's controls out of PC pages, and refuses navigation from a PC page into the launcher or a popup.

## How to get to it (user POV)

- Run `bun run desktop`, or start the app from its menu entry once packaged.
- The app opens a PC by itself. Use `File → Switch PC…` to reach the launcher, then choose `Open` on a PC, or paste a link under `Add a PC`.
- In a PC window, use `File → Switch PC…` (`Ctrl/Cmd+Shift+O`).

## Driving it with control-fabs

Preconditions:

- Launch with `$C launch --tailnet`, so the instance also stands in for the remote PC.
- `kwin_wayland` is installed. `$C desktop start` runs the app inside a virtual compositor, so nothing appears on the user's screen. While it runs, `$C browser …` actions drive its newest window, and `browser open` is refused.

- **First run.** Run `$C desktop start --fresh` and `$C browser wait --role button --name "This PC"`: no launcher. Capture `desktop/1-first-run` with `--role complementary --name "Bots"`. `browser eval "typeof window.fabsDesktop"` prints `"undefined"`.
- **Launcher.** Run `$C desktop menu "Switch PC…"` and `$C browser wait --role button --name "Connect"`. Capture `desktop/2-launcher`. `$C browser eval "typeof window.fabsDesktop"` prints `"object"`. Click `Open` on `This PC` to go back.
- **Isolation.** In that window, run `$C browser eval "location.href = 'fabs-app://launcher/desktop.html'; 1"`, then `browser eval "location.href"`: the page hasn't moved. `browser eval "window.open('fabs-app://launcher/desktop.html') === null"` prints `true`.
- **Remember.** Run `$C desktop stop` and `$C desktop start`. The app lands straight in the sidebar.
- **Switch.** Run `$C desktop menu "Switch PC…"` and wait for `--role region --name "PCs"`.
- **Pair a remote PC.** Run `$C browser fill --label "Pairing link or address" --value @pair-link`, then `fill --label "Name (optional)" --value Fedora`, then `click --role button --name "Connect"`. Wait for `--role button --name "This PC"`. `browser eval "location.hostname"` is the tailnet address (redacted). Capture `desktop/5-remote-paired`.
- **Stay signed in.** Run `$C desktop stop` and `$C desktop start`. The sidebar loads over the tailnet with no `Not paired yet`.
- **Saved PC wins.** Switch to `This PC`, then `$C desktop stop` and `$C desktop start`. `browser eval "location.hostname"` is still the tailnet address, not `127.0.0.1`.
- **Forget.** Run `$C desktop menu "Switch PC…"` and `$C browser click --role button --name "Forget Fedora"`. Then add it back with `--value @tailnet-url`, which has no token. Wait for `--role heading --name "Not paired yet"`.
- **Unreachable.** Fill `http://127.0.0.1:1` and click `Connect`. A `--role alert` says `Couldn't reach that PC`, and no new PC row appears.
- **Proof.** The snapshot and screenshot pairs above, plus `$C privacy-check`.

## Gotchas

- T3 Code terminals export `ELECTRON_RUN_AS_NODE=1`, which makes Electron start as plain Node. `bun run desktop` and `desktop start` both clear it. Clear it yourself if you start Electron another way.
- Menu accelerators don't fire from synthesized key presses. Use `$C desktop menu "<label>"`, which clicks the real menu item.
- `desktop start` rebuilds the Electron bundle, not the web app. After editing `web/`, run `bun run build` first, or relaunch.
- Saved PC addresses show in the launcher. Screenshots mask them, and snapshots redact tailnet IPs. Use `@pair-link` / `@tailnet-url` so the link never appears in commands or output.
- The remote PC here is this machine's own tailnet address. It proves pairing, cookies, and isolation, not reachability from a second machine.
