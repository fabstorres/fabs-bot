# Limits

The gauge next to the Settings gear opens Limits, a dialog that looks and moves like Settings. It shows how much usage is left on this PC's Claude Code and Codex logins. On desktop it opens on Claude Code, with a left nav (`Claude Code`, `Codex`), a search box, a `Limits / <Provider>` breadcrumb, and a close button. At 430px it opens the provider list, each provider opens inside the dialog with `Back`. Each page reads the CLI's own usage report without starting a chat or a model turn.

## Sub-features

- `limits-open` opens Limits from the sidebar gauge, on Claude Code on desktop.
- `limits-page` shows one row per usage window (`Session`, `Weekly`, `Weekly · <model>`, `Monthly`, `Extra usage`) with `<n>% left`, a bar that shrinks as usage grows, and `Resets in …` with the exact time in a tooltip. Below: the plan, Codex credits, and Codex reset credits as plain text. A window the CLI doesn't report is left out, never shown as 0%.
- `limits-states` shows `isn't installed` when the CLI's binary isn't found, a sign-in hint when the login reports no limits, and the error text when the check fails. A failed refresh keeps the last result with a `Couldn't refresh: …` alert.
- `limits-refresh` re-checks with `Refresh` (reads `Checking…`, then `Checked just now`). The server keeps each result for 60 s and shares one check between concurrent requests. `?refresh=1` skips the 60 s cache.
- `limits-focus` moves focus like Settings: the page heading on open, `limits-title` on the phone list, the provider you came from after `Back`, and `open-limits` after close or Escape.

## How to get to it (user POV)

- Sidebar `Limits` (the gauge, top, between the gear and `+`), on desktop or phone.

## Driving it with control-fabs

Preconditions:

- A launched instance. The checks use the real `claude` and `codex` logins on this PC. They are read-only and cost nothing.

- **Open.** `$C browser click --role button --name "Limits"`, `$C browser wait --text "% left"`. `nav[aria-label="Limits sections"] [aria-current=page]` reads `Claude Code`, focus is `limits-section-title`. Snapshot `--role dialog --name "Limits"`.
- **Nav.** Click `--role button --name "Codex"` and wait for `--text "Reset credits"`. The breadcrumb reads `Limits/Codex`.
- **Tooltip.** Focus the first `section[aria-label=Codex] [role=group] span[tabindex]` with `browser eval`, then `$C browser text --role tooltip` reads the exact reset time.
- **Refresh.** Click `--role button --name "Refresh"`: it reads `Checking…`, then `Checked just now`.
- **Close.** `Close limits` or Escape: no dialog, focus is `open-limits`.
- **Phone.** At `--viewport 430x932`, Limits opens the list (focus `limits-title`), `Claude Code` opens the page with the nav hidden, `Back` returns to the list with focus on `limits-nav-claude`.
- **Not installed.** In Settings → Providers → Codex, fill `Binary path` with a missing path and blur it. Back in Limits → Codex, `Refresh` shows `isn't installed`. Clear the path afterwards.
- **Error keeps last result.** With a good result showing, `$C api PUT /api/providers/codex '{"binaryPath":"/bin/false"}'` then `Refresh`: an alert reads `Couldn't refresh: Codex stopped before it reported usage. Showing the last result.` and the rows stay. Reset with `'{"binaryPath":""}'`.
- **Cache.** Two plain `$C api GET /api/providers/claude/limits` return the same `checkedAt`; `?refresh=1` returns a newer one; two parallel `?refresh=1` share one `checkedAt`.

## Gotchas

- Opening a provider page uses the cached result for up to 60 s. After changing a binary path, press `Refresh`.
- While Limits is open, `--role button --name "Limits"` would also match `Close limits`. Click the gauge from the chat view only.
- Percentages move between runs; assert on `% left` and the window labels, not exact numbers.
