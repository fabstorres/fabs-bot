# Settings

The gear at the top of the sidebar opens Settings as a full page, not a menu. On desktop it opens on Providers, with a left nav (`Providers`, `Plugins`, `This PC`), a search box that filters the nav, a `Settings / <Section>` breadcrumb, and a close button that returns to the chat that was open. At 430px the gear opens the section list, each section opens full-screen with `Back`, and the browser's back button walks the same way. Every section acts on the PC the window is connected to.

## Sub-features

- `settings-open` opens Settings from the sidebar gear, on Providers on desktop.
- `settings-nav` switches sections from the left nav. The open one is marked current and named in the breadcrumb.
- `settings-search` filters the nav by section name or by what's inside (`tailscale` finds This PC), and says when nothing matches.
- `settings-close` returns to the chat that was open in one step, however many sections were visited.
- `settings-phone` shows the section list at 430px, opens a section full-screen with `Back`, and walks back to the list, then to the bot list.

## How to get to it (user POV)

- Sidebar `Settings` (the gear, top, next to `+`), on desktop or phone.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README, with `Bot Chief`'s chat open.

- **Open.** Run `$C browser click --role button --name "Bot Chief"`, `$C browser click --role button --name "Settings"`, and `$C browser wait --role region --name "Providers"`. `$C browser eval "document.querySelector('button[aria-current=page]').textContent"` reads `Providers`. Capture `settings/open.aria.txt` of the whole page.
- **Sections.** Click `--role button --name "Plugins"` and wait for `--role region --name "Plugins"`. Click `--role button --name "This PC"` and wait for `--role group --name "Pair your phone or laptop"`. `--role navigation --name "breadcrumb"` reads `Settings / Plugins`, then `Settings / This PC`. On This PC, snapshot only the nav and the breadcrumb: the section lists peers.
- **Search.** Fill `--label "Search settings" --value "tailscale"`: the nav holds only `This PC`. With `--value "zzz"` it reads `Nothing matches "zzz".` Fill an empty value to clear it.
- **Close.** Click `--role button --name "Close settings"`. `--role region --name "Thread with Chief"` is back. `$C browser eval "history.length"` is the same as before Settings opened, plus one.
- **Phone.** Run `$C browser start --viewport 430x932`, `$C browser open /?phone`, and click `Settings`. The nav fills the screen with `Back` and the heading `Settings`, and no section is mounted. Click `Providers`: `--role region --name "Providers"` shows with `Back`, and the nav is hidden. `Back` returns to the list, and `Back` again to `--role complementary --name "Bots"`. `$C browser eval "history.back()"` walks the same steps.

## Gotchas

- While Settings is open, `--role button --name "Settings"` also matches `Close settings`. Click the gear from the chat view only.
- On desktop, nav clicks replace the history entry, so both close and the browser's back button return to the chat. At 430px each section is its own entry.
- A reload while Settings is open lands back in the latest chat on desktop and the bot list on the phone, as for any other view. The tab's history entries survive the reload, and a restarted harness browser restores its last tab, so Back can replay views from before. Open a new URL such as `/?phone` before walking Back.
- `This PC` also names the PC menu in the desktop app (`PC This PC`). The settings page hides the sidebar, so `--role button --name "This PC"` is unambiguous there.
