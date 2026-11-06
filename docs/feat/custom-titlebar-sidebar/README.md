# Custom title bar and sidebar verification

## Sidebar window controls follow-up

Linux and Windows now use a frameless PC window with shadcn ghost icon buttons at the top left of the sidebar: Minimize, Maximize/Restore, Close. Limits and New bot remain on the right. macOS keeps its native traffic lights. The native Electron overlay and its theme synchronization are removed, along with every `window-controls-space` reservation.

Below md, the same buttons appear on the left of each full-width chat, desk, new-bot and screen header, wherever macOS reserves traffic-light space. They stay available when the sidebar is hidden. The sidebar title is visually hidden in desktop windows to leave that row clear. Browser and older-desktop layouts keep their normal title and have no custom controls or drag behavior.

The HTML capability marker now requires `content="sidebar-controls"`. Both main's web build and the previous overlay-based PR build retain the normal OS frame in the new desktop. The previous `custom` capability is insufficient because that build cannot draw the new buttons. A missing marker or failed probe also retains the normal frame.

## Current verification

Used `.claude/skills/verify-fabs-bot/SKILL.md` on Linux/KDE with Electron 44.7.0. Private runs `sidebar-controls-run-1106` and `sidebar-controls-final-1106` used their own `FABS_VERIFY_HOME`, database, bot desks, desktop profiles, and private D-Bus/KWin virtual display. The harness built web and desktop, cleared `ELECTRON_RUN_AS_NODE`, and doctor confirmed private storage, fresh sources, owned port 4890 and working desktop CDP. Port 4891 was checked free for the server's adjacent listener. Baseline web proxies used private loopback ports 4892 and 4894. Production port 4800 and production data were not driven.

| Check | Result and evidence |
| --- | --- |
| Light, desk closed/open | Controls at the sidebar's left; normal chat button spacing. [Closed](05-linux-light.png), [open](19-linux-light-desk.png). |
| Dark, desk closed/open | Controls follow Tailwind theme colors with no overlay sync. [Closed](06-linux-dark.png), [open](20-linux-dark-desk.png). |
| Maximize and restore | Real KWin pointer clicks produced `isMaximized: true`, then `false`; the accessible name switched from Maximize to Restore and back. [Maximized](21-maximized.png), [state readback](window-controls.json). |
| Minimize | Real pointer click produced `isMinimized: true`; the inspector restored the minimized window for subsequent checks. [State readback](window-controls.json). |
| Close | Real pointer click on Close in the 650px new-bot header removed every window pixel and closed the Electron process/CDP connection. [State readback](window-controls.json). |
| Dragging | Opaque bounds moved from `(0,0,900,650)` to `(40,40,940,690)` after sidebar dragging, then `(72,72,972,722)` after chat-header dragging. [Before](08-drag-before.png), [sidebar](09-sidebar-drag.png), [chat](10-chat-drag.png). These are compositor captures; the drag threshold accounts for the difference from the pointer delta. |
| Buttons inside drag regions | Buttons compute to `no-drag`; headers compute to `drag`. A real pointer click on New bot opened its pane without changing `(72,72,972,722)` bounds. [Screenshot](11-button-in-drag.png). |
| Narrow desktop | At 650×650, controls remain reachable in the [sidebar](24-narrow-sidebar.png), [chat](22-narrow-chat.png), [desk](23-narrow-desk.png) and [new-bot pane](25-narrow-new-bot.png). The sidebar group occupies `(16,18,104,32)`; pane groups occupy `(12,12,104,32)`. No horizontal overflow. |
| PC menu | The existing footer menu still opens. [Screenshot](18-footer-pc-menu.png). |
| New desktop + main web | Built main at `8126763`, served it through a proxy to the private server, and opened it through the PC bridge. Normal frame, absent platform flag, zero custom controls, computed drag `none`. [Screenshot](15-new-app-old-web.png). |
| New desktop + previous PR web | Built `1cba746` with the old `custom` marker and opened it through a second proxy. Normal frame, absent platform flag, zero custom controls, computed drag `none`. [Screenshot](26-new-app-previous-web.png). |
| Main desktop + new web | Ran the real main desktop bundle with a separate private profile in the virtual display. No window-controls bridge, no platform flag, no controls, computed drag `none`; the OS frame remains. [Screenshot](17-old-app-new-web.png). |
| IPC authorization | All four new invoke handlers use the existing `fromPcWindow` gate. Direct handler checks rejected missing frames, a different frame at the correct origin, and a different sender window. Only the PC window's main frame at its PC origin is authorized. [Results](window-controls.json). |
| Privacy | Every replacement PNG has an ARIA twin and was visually inspected. Captures mask `#pc-link`, `.mono-box`, `button[aria-label="This PC"]`, and the current PC-menu trigger/name. Native captures were composited onto a neutral backdrop. Harness privacy scan and literal scans for private-address/token patterns passed before pushing. |

### Header measurements against main

Measured `getBoundingClientRect()` on the actual Open desk and More buttons in maximized Electron windows at 1024px content width. Both windows begin at screen x=0, so these x bounds are also their on-screen x bounds. The main window has a 24px OS title bar; its content height is 744 rather than 768. Box tuples below are `(x, y, width, height)` relative to the web content. Complete raw measurements are in [window-controls.json](window-controls.json).

| Desk | Build | Open desk box | More box | Extra x shift versus main |
| --- | --- | --- | --- | --- |
| Closed | main | `(924,10,36,36)` | `(968,10,36,36)` | — |
| Closed | follow-up | `(924,10,36,36)` | `(968,10,36,36)` | 0px |
| Open | main | `(564,10,36,36)` | `(608,10,36,36)` | — |
| Open | follow-up | `(564,10,36,36)` | `(608,10,36,36)` | 0px |

Opening the desk reduces the chat width by its normal 360px on both main and this branch. The buttons follow the chat's right edge by that amount; there is no additional native-overlay padding or change in reserved window-control space. Their right edges remain 64px and 20px from the chat edge respectively. At 650px, the chat buttons occupy `(558,10,36,36)` and `(602,10,36,36)`, while the controls end at x=116 on the left.

## Existing sidebar evidence

The initial PR implementation came from Opus; Sol made the optional-bridge callback fixes and the original evidence package. This follow-up changes the window-controls approach and replaces the Linux evidence. Existing independent sidebar evidence remains available:

- [No lead](01-no-lead.png), [selected lead](02-lead.png), [search](03-search.png), and [phone Favorites](04-phone.png).
- Opus's successful real Haiku turn: [needs you](opus-05-lead-needs-you.png), [opening a question](opus-06-lead-click-opens-question.png), [live state](opus-07-lead-live-status.png), [unread](opus-08-lead-unread.png), and [tool/thread proof](opus-lead-thread.txt).

Sol's earlier fresh lead-question rerun hit Claude's five-hour usage limit and is not a pass. Those lead-state captures are inherited evidence, not reruns for this window-controls fix. The bots seeded for the current window checks use `claude-haiku-5-5` for Claude fixtures; no new agent question/tool check is claimed.

## Blast radius and limitations

Changes affect PC-window creation and capability detection in `openPc`, the optional PC preload/shared bridge, sidebar and narrow-pane controls, header spacing and the removed theme-to-overlay sync. New IPC handlers are `pc:minimize`, `pc:toggle-maximize`, `pc:close`, and `pc:is-maximized`; maximize/unmaximize events publish `pc:maximized`. All invoke handlers share the existing PC-window/main-frame/origin gate. The preload's state subscription and React's `useSyncExternalStore` keep Maximize/Restore current without `useEffect`.

The sidebar footer/team-lead behavior, server, database and launcher frame are unchanged by this follow-up. The small capability change deliberately keeps older web builds framed, including the previous PR build. macOS traffic lights and Windows behavior still need native-platform verification; only Linux was driven here. Existing history behavior can keep Back from returning to the sidebar after a resize; narrow sidebar verification uses a reload, and that history code is unchanged.

No reviewer was spawned and no merge was performed. The parent thread will arrange re-review after the push. Private instances and helper processes were cleaned up; evidence remains in this folder.
