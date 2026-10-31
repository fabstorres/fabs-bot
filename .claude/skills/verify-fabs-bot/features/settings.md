# Settings

The gear at the top of the sidebar opens Settings in a shadcn dialog over the current chat. On desktop it opens on Providers, with a left nav (`Providers`, `Plugins`, `This PC`, `Appearance`), a search box that filters the nav, a `Settings / <Section>` breadcrumb, and a close button that returns to the chat that was open. At 430px the gear opens the section list, each section opens inside the dialog with `Back` to the list. Close, Escape, or clicking the overlay dismisses Settings without adding browser-history entries. The chat and draft stay mounted underneath. Every section acts on the PC the window is connected to, except Appearance: its theme is saved on this device only.

## Sub-features

- `settings-open` opens Settings from the sidebar gear, on Providers on desktop.
- `settings-nav` switches sections from the left nav. The open one is marked current and named in the breadcrumb.
- `settings-search` filters the nav by section name or by what's inside (`tailscale` finds This PC), and says when nothing matches.
- `settings-close` returns to the chat that was open in one step, however many sections were visited.
- `settings-phone` shows the section list at 430px, opens a section inside the dialog with `Back`, and returns to the list. Close returns to the bot list.
- `settings-theme` switches the whole app between `System`, `Light`, and `Dark` at once, keeps the choice across reloads without a light flash, and with `System` follows the device setting live.
- `settings-focus` moves keyboard focus with each step: the section heading when a section opens from outside it, the `Settings` heading on the phone list, the section you came from when going back to the list, and the gear once Settings closes. Tab and Shift+Tab stay inside the dialog.

## How to get to it (user POV)

- Sidebar `Settings` (the gear, top, next to `+`), on desktop or phone.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README, with `Bot Chief`'s chat open.

- **Open.** Run `$C browser click --role button --name "Bot Chief"`, `$C browser click --role button --name "Settings"`, and `$C browser wait --role region --name "Providers"`. `$C browser eval "document.querySelector('button[aria-current=page]').textContent"` reads `Providers`. Wait for `--role dialog --name "Settings"`. Capture `settings/open.aria.txt` plus `.png` of the whole page.
- **Sections.** Click `--role button --name "Plugins"` and wait for `--role region --name "Plugins"`. Click `--role button --name "This PC"` and wait for `--role group --name "Pair your phone or laptop"`. `--role navigation --name "breadcrumb"` reads `Settings / Plugins`, then `Settings / This PC`. On This PC, snapshot only the nav and the breadcrumb: the section lists peers.
- **Search.** Fill `--label "Search settings" --value "tailscale"`: the nav holds only `This PC`. With `--value "zzz"` it reads `Nothing matches "zzz".` Fill an empty value to clear it.
- **Close and preserve.** Before opening Settings, fill `--label "Message"` with a draft and record `history.length` and the chat DOM node using `browser eval`. Change several sections, then click `--role button --name "Close settings"`. `--role region --name "Thread with Chief"` is back, the draft is unchanged, the chat DOM node is identical, and `history.length` is unchanged. Repeat with `browser press --key Escape` and a click on the overlay outside the dialog.
- **Phone.** Run `$C browser start --viewport 430x932`, `$C browser open /?phone`, and click `Settings`. The dialog shows the nav with `Close settings` and the heading `Settings`, and no section is mounted. Click `Providers`: `--role region --name "Providers"` shows with `Back`, and the nav is hidden. `Back` returns to the list, and `Close settings` returns to `--role complementary --name "Bots"`. Confirm the dialog fits within the viewport and its section scrolls vertically without horizontal overflow.

- **Theme.** Click `Appearance`, then `--role combobox --name "Theme"` (reads `System` on a fresh browser), `$C browser wait --role option --name "Dark"`, and click it. `$C browser eval "[document.documentElement.className, localStorage.getItem('theme')]"` reads `["dark","dark"]` and the page turns dark at once. Close Settings: the chat is dark too. `$C browser open /` keeps it dark. Pick `System` to go back: `localStorage` holds no `theme` and the page follows the browser, which is light in the harness. Capture `settings/theme-dark.aria.txt` plus `.png` of the chat.

- **Focus.** After each step above, `$C browser eval "[document.activeElement.tagName, document.activeElement.id, document.activeElement.textContent.trim()]"` reads: on desktop, `H2 settings-section-title Providers` after opening, `BUTTON settings-nav-plugins Plugins` after clicking Plugins, and `BUTTON open-settings` after `Close settings` or Escape. Tab and Shift+Tab must stay inside Settings while it is open. At 430px: `H1 settings-title Settings` on the list, `H2 settings-section-title Providers` in the section, `BUTTON settings-nav-providers Providers` after `Back`, and `BUTTON open-settings` after `Close settings` to the bot list.

## Gotchas

- While Settings is open, `--role button --name "Settings"` also matches `Close settings`. Click the gear from the chat view only.
- Settings and its sections do not create history entries. The phone Back button changes the visible section inside the dialog; it does not navigate the browser.
- A reload closes Settings and lands in the latest chat on desktop or the bot list on the phone.
- At 430px the Theme dropdown closes before the next command can pick an option: each command re-pins the viewport, and the resize closes the menu. Pick by typing on the closed select instead: `$C browser press --role combobox --name "Theme" --key d` picks `Dark` (`l` Light, `s` System).
- The harness can't switch the browser's own light/dark setting, so `System` following the device live needs one CDP session that calls `page.emulateMedia({ colorScheme: "dark" })` and reads `<html>` while still connected. The override ends when that session disconnects.
- `This PC` also names the PC menu in the desktop app (`PC This PC`). The dialog makes the sidebar inert, so `--role button --name "This PC"` is unambiguous there.
