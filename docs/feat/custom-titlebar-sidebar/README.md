# Custom title bar and sidebar verification

Verified on Linux/KDE with Electron 44.7.0 using `.claude/skills/verify-fabs-bot/SKILL.md`. The isolated runs were `sol-titlebar`, `sol-titlebar-final`, and `sol-titlebar-menu`, on loopback port 4870, with private databases, work folders, desktop profiles, and a virtual KWin compositor. The user's port 4800 and production data were not driven.

## Handoff attribution

Opus implemented all functional changes before the handoff: PC-window title bars and platform bridge, theme-synchronized native overlay, desktop-only drag regions and control spacing, older-web detection, the sidebar footer, the team-lead spot and shared row behavior, search and phone handling, plus documentation updates. Opus left no commit or PR. Its recorded verification covered Linux light/dark, native controls and dragging, lead states, browser/phone layouts, and both directions of desktop/web version skew. Its macOS check was simulated only.

Sol compared all 24 handed-off files against the preserved pre-Sol snapshot before working. No layout or window-behavior fixes were necessary. CI then found two `TS18048` errors in the inherited PC menu: imported `switcher` was possibly undefined inside the Change icon and Manage PCs callbacks. Sol changed those two calls to `switcher?.setIcon(...)` and `switcher?.manage()`, consistent with the existing optional bridge calls. Sol also corrected the opening sentence of `.claude/skills/verify-fabs-bot/features/limits.md` to locate Limits at the top beside New bot instead of beside Settings. The other 22 handoff files remain byte-identical. Everything added under this evidence directory, the final verification, commits, push, and PR completion are Sol's contributions. The handoff snapshot and original Opus checkout were preserved.

## Sol's verification

| Check | Result and evidence |
| --- | --- |
| Isolated instance | `doctor` confirmed the server's private work root, fresh web build, owned port, and working desktop CDP connection. Web and desktop builds were run by the verify harness. |
| Browser, no lead | No dedicated lead spot; footer Settings retains `#open-settings`. [Screenshot](01-no-lead.png), [ARIA](01-no-lead.aria.txt). |
| Lead and search | Used More → Edit Chief → Team lead → Save. One selected lead spot, no duplicate in Chats; searching Chief restores its row. [Selected](02-lead.png), [search](03-search.png). |
| Phone | At 430×932 the lead appears once, Favorites exclude it, and the footer remains visible. No desktop flag or drag behavior, and no horizontal overflow. [Screenshot](04-phone.png). |
| Native Linux overlay | Visible overlay with 72px reserved width. Changed Light → Dark through Settings → Appearance; native control symbols changed with it. [Light](05-linux-light.png), [dark](06-linux-dark.png). |
| Native window actions | Real KWin pointer input maximized, restored, minimized, and closed the custom PC window. Main-process reads returned `isMaximized: true`, then `false`, then `isMinimized: true`. Close removed all window pixels and exited the app process. |
| Native drag regions | With a 900×650 window, the opaque window bounds moved from `(0,0,900,650)` to `(40,40,940,690)` after sidebar dragging and then `(72,72,972,722)` after chat-header dragging. [Before](08-drag-before.png), [sidebar](09-sidebar-drag.png), [chat](10-chat-drag.png). The compositor's drag threshold accounts for the difference from the pointer delta. |
| Buttons inside drag regions | Computed region values were `drag` on the header and `no-drag` on New bot. A real pointer click opened New Bot, with bounds unchanged at `(72,72,972,722)`. [Screenshot](11-button-in-drag.png). |
| Narrow desktop | At 650px, Back/Open desk/More ended at x=48/514/558, before the native control area at x=578. The reloaded narrow sidebar kept Limits and New bot clear of controls, with no horizontal overflow. |
| PC-menu callbacks after CI fix | Changed the This PC icon to Server through the footer menu, read the saved icon back from the private desktop store, and opened Manage PCs to the launcher. [Screenshot](18-footer-pc-menu.png). |
| Footer and dialogs | Footer Settings and top Limits both opened and closed. Settings was `no-drag` and began at y=56, below the window controls. |
| New desktop + old web | Served the pre-feature web build through a loopback proxy into the isolated server. Switched to it through the PC menu. The platform flag was absent, overlay invisible, drag disabled, and normal compositor frame visible. [Screenshot](15-new-app-old-web.png). |
| Old desktop + new web | Ran the baseline desktop bundle in the same private compositor with a separate private profile. Its relevant sources matched git base `8126763`. The new footer loaded, platform flag was absent, drag disabled, and normal frame visible. [Screenshot](17-old-app-new-web.png). |
| Privacy | Every committed PNG has an ARIA twin. Sol inspected every image, and `control-fabs privacy-check docs/feat/custom-titlebar-sidebar` passed. Native captures include the compositor's controls; their transparent desktop was composited onto a neutral backdrop. No GIFs or videos are included. |

## Inherited lead-state evidence

Sol's fresh real Claude Haiku question attempt hit the account's five-hour usage limit. It did not produce a question, so that rerun is not a pass. The following evidence was produced by Opus's successful real Haiku turn in `desktb0a59`, inspected by Sol, and copied unchanged. All relevant source files remain byte-identical to the handoff.

- [Needs you and waiting status](opus-05-lead-needs-you.png).
- [Clicking the lead opens its pending question](opus-06-lead-click-opens-question.png).
- [Live avatar](opus-07-lead-live-status.png), with the [ARIA snapshot](opus-07-lead-live-status.aria.txt) recording `Thinking…` during the same turn. The screenshot was taken after that transient text cleared.
- [Unread state](opus-08-lead-unread.png).
- [Real thread/tool proof](opus-lead-thread.txt): `ask_user`, the question, the user's answer, and the completed reply.

## Limits and blast radius

The functional change affects only PC windows created by `openPc`, the optional PC preload bridge, shared sidebar presentation, pane headers, desktop dialog/toast spacing, and theme-to-overlay synchronization. There are no server/database changes. `openPc` now probes the root HTML for the capability meta tag before choosing a frame; a missing tag or failed probe retains the normal frame. Old desktops omit the new platform flag, so the new web build retains browser-like header behavior there. The launcher keeps its existing normal frame and is a possible follow-up.

Electron's native `titleBarStyle: "hidden"` plus `titleBarOverlay` worked on Linux 44.7.0, so no replacement IPC window buttons were added. Native overlay symbols had no hover highlight on Linux; Opus also observed this with a solid overlay color. The app follows the active page theme when it changes.

Real macOS traffic-light placement and real Windows controls remain unverified. Opus only simulated macOS spacing; Sol does not claim a native macOS pass. An existing history behavior can keep Back from returning to the sidebar after shrinking a previously wide desktop session; the relevant history code is unchanged, and narrow sidebar verification used a reload. The lead's fresh real-agent question rerun remains limited by Claude usage; inherited successful evidence is distinguished above. No reviewer was spawned and no merge was performed; the parent will arrange Astra review.
