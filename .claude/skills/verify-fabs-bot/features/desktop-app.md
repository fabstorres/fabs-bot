# Desktop app

`bun run desktop` opens straight into a PC: the last saved PC opened, else the newest paired, else `This PC`. The launcher, listing `This PC` and saved PCs, only shows from `Manage PCs…` in the PC menu, `Switch PC…` (`Ctrl/Cmd+Shift+O`), or when the chosen PC doesn't answer. Opening a PC shows its Fabs Bot in its own window. This is how a laptop works with the bots on another PC over the tailnet. Adding a PC takes a one-time pairing link from that PC's `Settings` → `This PC` → `Pair a device`; a bare address connects but shows `Not paired yet`. The app remembers the PC, reopens it on the next start, and stays signed in. The PC menu at the bottom of the sidebar lists `This PC` and every saved PC with its icon, switches between them in one click, and changes the open PC's icon. `Switch PC…` (`Ctrl/Cmd+Shift+O`) returns to the launcher. Pages from a PC can't reach the launcher or its controls: they only get the PC menu's names and icons (never addresses), switching, changing an icon, and opening the launcher.

On Windows and Linux neither window shows a menu bar. On macOS the system menu bar only has the Fabs Bot app menu (About, Services, Hide, Quit), with no File / Edit / View / Window. The shortcuts still work on every platform.

A PC window has no system title bar. On Windows and Linux the app draws minimize, maximize and close at the top right, over the page, with symbols that follow the page's light or dark theme; the header under them leaves room for them. On macOS the traffic lights sit at the top of the sidebar, which leaves room for them. The sidebar's top row and the header of each pane (chat, desk, new bot, screen) move the window; their buttons still click. The app only does this for a PC whose page carries `<meta name="fabs-title-bar">`. A PC running an older Fabs Bot opens with the normal window frame. The launcher keeps its normal frame.

## Sub-features

- `desktop-launcher` lists This PC and saved PCs, and adds a PC from a link.
- `desktop-first-run` opens This PC on a fresh start, without the launcher.
- `desktop-startup` prefers a saved PC over This PC, even when This PC was opened last.
- `desktop-local` opens This PC when its server is running.
- `desktop-remote-pair` pairs with another PC from its one-time pairing link and shows its bots. The reachability checks before it don't use up the link, and the PC lists the app as `Desktop app on <OS>`.
- `desktop-remember` reopens the last PC after a restart, still signed in.
- `desktop-no-menu-bar` keeps the menu bar hidden on Windows and Linux, in the launcher and PC windows, even after Alt. On macOS only the app menu is left.
- `desktop-title-bar` draws the PC window's own title bar: window controls that work and follow the theme, drag regions whose buttons still click, room for the controls in narrow windows, and the normal frame for a PC on an older build.
- `desktop-switch` goes back to the launcher from the menu or `Manage PCs…`.
- `desktop-pc-menu` lists This PC and saved PCs with their icons, switches in one click, shows an error toast for a PC that doesn't answer, and saves each PC's icon next to its name in the app's PC list.
- `desktop-forget` forgets a PC and its sign-in; adding it again needs a new pairing link.
- `desktop-removed` shows `Not paired yet` in the app once the PC removes it under `Paired devices`.
- `desktop-unreachable` refuses a link that doesn't answer, without saving it.
- `desktop-isolation` keeps the launcher's controls out of PC pages, and refuses navigation from a PC page into the launcher or a popup.

## How to get to it (user POV)

- Run `bun run desktop`, or start the app from its menu entry once packaged.
- The app opens a PC by itself. Use `Switch PC…` (`Ctrl/Cmd+Shift+O`) to reach the launcher, then choose `Open` on a PC, or paste a link under `Add a PC`.
- In a PC window, open the PC menu at the bottom of the sidebar to switch PCs, change the open PC's icon, or choose `Manage PCs…`.
- In a PC window, use `Switch PC…` (`Ctrl/Cmd+Shift+O`).

## Driving it with control-fabs

Preconditions:

- Launch with `$C launch --tailnet`, so the instance also stands in for the remote PC.
- `kwin_wayland` is installed. `$C desktop start` runs the app inside a virtual compositor, so nothing appears on the user's screen. While it runs, `$C browser …` actions drive its newest window, and `browser open` is refused.

- **First run.** Run `$C desktop start --fresh` and `$C browser wait --role button --name "Settings"`: no launcher. Capture `desktop/1-first-run` with `--role complementary --name "Bots"`. `browser eval "[typeof window.fabsDesktop, typeof window.fabsPcs]"` prints `["undefined", "object"]`.
- **Launcher.** Run `$C desktop menu "Switch PC…"` and `$C browser wait --role button --name "Connect"`. Capture `desktop/2-launcher`. `$C browser eval "[typeof window.fabsDesktop, typeof window.fabsPcs]"` prints `["object", "undefined"]`. Click `Open` on `This PC` to go back.
- **Isolation.** In that window, run `$C browser eval "location.href = 'fabs-app://launcher/desktop.html'; 1"`, then `browser eval "location.href"`: the page hasn't moved. `browser eval "window.open('fabs-app://launcher/desktop.html') === null"` prints `true`.
- **No menu bar.** In the PC window and again in the launcher, `browser eval "innerHeight === outerHeight"` prints `true`. A visible menu bar makes `innerHeight` smaller. The harness runs on Linux, so check the macOS system menu bar on a Mac by hand.
- **Title bar.** `$C browser eval "[document.documentElement.dataset.titleBar, navigator.windowControlsOverlay.visible, innerWidth - navigator.windowControlsOverlay.getTitlebarAreaRect().width]"` prints `["linux", true, 72]`. In a plain browser the first two are `null` and `false`. Page screenshots don't show the native controls and synthesized clicks don't drag the window, so see the title bar setup below for pictures and real input. Capture the window in light and dark (Settings → Appearance → Theme): the symbols turn light on dark. Click maximize, minimize and close for real and read `isMaximized()` / `isMinimized()` from the main process. Press on an empty spot of the sidebar's top row and of the chat header, move, release: the window moves by the same amount in the screenshots. Click `New bot` the same way: its pane opens and the window stays put. Resize the window under 768px wide from the main process: `Limits`, `New bot`, `Open desk` and `More` stay left of the controls.
- **Older PC.** Serve a build without the `fabs-title-bar` meta (for example `main` before this change) behind a proxy to the run's port, add it to `<runDir>/desktop/pcs.json`, and switch to it from the PC menu. Its window has the compositor's title bar, and `window.fabsPcs.titleBar` is `undefined`.
- **Remember.** Run `$C desktop stop` and `$C desktop start`. The app lands straight in the sidebar.
- **Switch.** Run `$C desktop menu "Switch PC…"` and wait for `--role region --name "PCs"`.
- **Pair a remote PC.** Run `$C browser fill --label "Pairing link or address" --value @pair-link`, then `fill --label "Name (optional)" --value Fedora`, then `click --role button --name "Connect"`. Wait for `--role button --name "Settings"`: the link survived the app's reachability checks. `browser eval "location.hostname"` is the tailnet address (redacted). Capture `desktop/5-remote-paired`. In the app, `Settings` → `This PC` → `Paired devices` lists `Desktop app on Linux` with `This device`.
- **PC menu.** With the saved PC open, click `--role button --name "PC Fedora"`. The menu lists `This PC` and `Fedora` as `menuitemradio`, `Fedora` `[checked]`. `browser eval "fabsPcs.list().then(JSON.stringify)"` shows ids, names, icons and `current`, never an address. Choose `Change icon` → `Server`: the trigger's icon gets class `lucide-server`, and `<runDir>/desktop/pcs.json` has `"icon": "server"` on that PC (`localIcon` for This PC). Choose `This PC` in the menu: the app opens `127.0.0.1` and keeps running. `Manage PCs…` opens the launcher.
- **PC menu, unreachable.** Add `{"id": "dead", "name": "Garage", "origin": "http://127.0.0.1:1"}` to `pcs` in `<runDir>/desktop/pcs.json`, run `browser eval "location.reload(), 1"`, and choose `Garage` in the PC menu. A toast says `Couldn't reach that PC`, and the window stays put. Remove the entry after.
- **Stay signed in.** Run `$C desktop stop` and `$C desktop start`. The sidebar loads over the tailnet with no `Not paired yet`.
- **Saved PC wins.** Switch to `This PC`, then `$C desktop stop` and `$C desktop start`. `browser eval "location.hostname"` is still the tailnet address, not `127.0.0.1`.
- **Removed by the PC.** From a script on the PC, `DELETE /api/devices/<id>` for the app's device (or click `Remove Desktop app on Linux` in a loopback browser). The app window shows `--role heading --name "Not paired yet"` without a restart.
- **Forget.** Run `$C desktop menu "Switch PC…"` and `$C browser click --role button --name "Forget Fedora"`. Then add it back with `--value @tailnet-url`, which has no code. Wait for `--role heading --name "Not paired yet"`. Adding it with a fresh `@pair-link` signs it in again.
- **Unreachable.** Fill `http://127.0.0.1:1` and click `Connect`. A `--role alert` says `Couldn't reach that PC`, and no new PC row appears.
- **Proof.** The snapshot and screenshot pairs above, plus `$C privacy-check`.

## Gotchas

- Title bar setup: start a private `dbus-daemon --session --fork --print-address`, then export its address plus `KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1 KWIN_WAYLAND_NO_PERMISSION_CHECKS=1` before `$C desktop start`, so the virtual kwin owns its own bus. `WAYLAND_DISPLAY=fabs-verify-<runId> QT_QPA_PLATFORM=wayland spectacle -b -n -f -o out.png` then captures the whole virtual screen, and a small `org_kde_kwin_fake_input` client sends real pointer moves and clicks. Spectacle leaves the desktop transparent and doesn't draw the pointer: composite onto a backdrop and mark the pointer yourself.
- Send a fake-input move and its click in the same connection. A click from a fresh connection is ignored by the window controls.
- On Wayland, `getPosition()` and `setPosition()` mean nothing. Read the window position from the screenshot (its dark or light box), and size it with `setSize()` from the main process.
- The native controls have no hover highlight on Linux.
- T3 Code terminals export `ELECTRON_RUN_AS_NODE=1`, which makes Electron start as plain Node. `bun run desktop` and `desktop start` both clear it. Clear it yourself if you start Electron another way.
- `Manage PCs…` and switching from the PC menu close the window the driver is attached to, so that click can fail with `Target page, context or browser has been closed`. The click still happened; wait on the next window's handle.
- The harness redacts this PC's hostname in text and masks it in screenshots, ignoring case. A saved PC whose name matches the hostname shows as `<pc>`; pick another name when it must stay visible.
- Menu accelerators don't fire from synthesized key presses. Use `$C desktop menu "<label>"`, which clicks the real menu item.
- `desktop start` rebuilds the Electron bundle, not the web app. After editing `web/`, run `bun run build` first, or relaunch.
- Saved PC addresses show in the launcher. Screenshots mask them, and snapshots redact tailnet IPs. Use `@pair-link` / `@tailnet-url` so the link never appears in commands or output.
- The remote PC here is this machine's own tailnet address. It proves pairing, cookies, and isolation, not reachability from a second machine.
