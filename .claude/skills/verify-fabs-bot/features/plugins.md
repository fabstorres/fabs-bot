# Plugins

Settings → Plugins is one table of every MCP server a bot can use. Rows come from two places: plugins added in Fabs Bot (passed to Claude and Codex bots that turn them on) and plugins inherited from this PC's Claude Code and claude.ai setup (Claude bots only, marked with a `Claude` badge). Each row shows a logo (or a neutral server tile for custom and unknown servers), a type (`Web` or `Local`), and a status. A toolbar holds search, a source filter, and `Add`, whose menu only offers built-in plugins that aren't in the table yet.

## Sub-features

- `plugins-table` lists inherited rows (name without the `claude.ai ` prefix, `Claude` badge, `Connected` check or `Needs sign-in` / `Failed` text) and Fabs Bot rows (`Added` check, `Custom` badge for custom servers, a `<name> options` menu).
- `plugins-icons` shows brand logos for Notion, Google Drive, Gmail, Google Calendar, Google Docs, GitHub and Browser (Playwright), and a neutral server tile for everything else.
- `plugins-add` opens `Add` → a built-in plugin or `Custom server` → the `Add <name>` form → `Save` adds a row.
- `plugins-add-dedup` hides a built-in plugin from the `Add` menu while a row with the same service is in the table, from either source. Removing that row brings it back. `Custom server` is always offered.
- `plugins-row-menu` offers `Edit` (opens `Edit <name>` with the saved values) and `Remove` (drops the row).
- `plugins-filter` narrows the table with `Filter plugins` → `All plugins` / `Added in Fabs Bot` / `From Claude`, and `Search plugins` by name.
- `plugins-scan` reads the inherited list from `claude mcp list` the first time the section opens, keeps it, and re-reads it with `Rescan` in the footer (`Scanning…` while it runs, then `scanned <time>`).

## How to get to it (user POV)

- Sidebar gear → `Plugins` in the Settings nav, on desktop or phone (list → `Plugins`).
- Settings search: `mcp`, `connectors`, `notion`, `github`, … match `Plugins`.

## Driving it with control-fabs

Preconditions:

- A launched instance and a logged-in `claude` CLI. The inherited rows are the user's real claude.ai connectors and Claude Code MCP servers, read-only.

- **Open.** `$C browser click --role button --name "Settings" --exact`, `$C browser click --role button --name "Plugins" --exact`, `$C browser wait --role cell --name "Gmail"` (or any inherited name from `$C api GET /api/connectors/inherited`). Snapshot `--role region --name "Plugins"`: rows read `<name> Web Claude Connected`.
- **Add a built-in.** `$C browser click --role button --name "Add" --exact`, snapshot `--role menu`: no item for a service already in the table. `$C browser click --role menuitem --name "Browser"`, `$C browser wait --role dialog --name "Add Browser"`, `$C browser click --role button --name "Save" --exact`: a `Browser Local Added` row appears, `$C api GET /api/connectors` lists it, and the `Add` menu no longer has `Browser`.
- **Add a custom server.** `Add` → `--role menuitem --name "Custom server"` → `--label "Name"`, `--role button --name "HTTP URL"`, `--label "URL"` → `Save`: the row reads `<name> Web Custom Added` with the server tile.
- **Row menu.** `$C browser click --role button --name "<name> options"` → `Edit` opens `--role dialog --name "Edit <name>"` with the saved URL or command; `Remove` drops the row and a removed built-in is back in the `Add` menu.
- **Filter and search.** `Filter plugins` → `--role menuitemradio --name "Added in Fabs Bot"`: only Fabs Bot rows. `--label "Search plugins"` with `goo`: only names containing it.
- **Rescan.** Click `--role button --name "Rescan"`: it reads `Scanning…`, then `scanned <time>`.
- **Dark and phone.** Settings → Appearance → `Theme` → `Dark`, back to `Plugins`. At `--viewport 430x932` the table fits without horizontal scroll: `browser eval` on `[data-slot=table-container]` gives `scrollWidth == clientWidth`.

## Gotchas

- The first visit runs `claude mcp list` (health checks take a few seconds). Wait on an inherited cell, not on the empty state.
- The inherited list is cached in the instance's database. A fresh `launch` starts with no cache.
- Removing a row has no confirmation dialog.
