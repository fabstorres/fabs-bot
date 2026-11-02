# Limits

The gauge next to the Settings gear opens Limits, one dialog that shows how much usage is left on this PC's Claude Code and Codex logins at a glance. It has no nav and no sections: a header (`Limits`, a `Checked …` note, `Refresh`, `Close limits`) over one scrolling page with a Claude Code section, then a Codex section. Both are checked in parallel when it opens. It is the size of Settings on desktop and full screen at 430px. Each check reads the CLI's own usage report without starting a chat or a model turn.

## Sub-features

- `limits-open` opens Limits from the sidebar gauge. Focus lands on the `Limits` heading.
- `limits-page` shows a heading per provider (icon, name, plan such as `Pro` or `Plus` in muted text) and one card per usage window (`Session`, `Weekly`, `Weekly · <model>`, `Monthly`). Each card has the label, a big `<n>%` with `left`, a pace icon, and a bar. On desktop the bar sits beside the label; at 430px it sits below it. A window the CLI doesn't report is left out, never shown as 0%.
- `limits-bar` is a solid fill for the part left (Claude terracotta, Codex grey), a hatched track for the part used, a thin tick where even spending would be (how much of the window's time is left), and a countdown badge with a clock icon at the bar's right end. The badge's tooltip is the exact reset time.
- `limits-pace` is the icon after `left`: `Ahead of pace…` (trending up) when less is left than time, `Under pace…` (trending down) when more is left, `On pace…` (gauge) within 5 points. Its tooltip says which.
- `limits-extras` shows Codex reset credits on a small muted line with a reset icon right under the Weekly bar (`3 resets available · next expires in 9d`, the expiry has the exact time in a tooltip). Display only. Claude extra usage (`Extra usage · <n>% used`, only when enabled) and Codex credits (`Credits · …`) are small text under that provider's cards.
- `limits-states` shows a compact muted card in the provider's section: `isn't installed` when the CLI's binary isn't found, a sign-in hint when the login reports no limits, and the error text when the check fails with no earlier result. A failed refresh keeps the last result with a small `Couldn't refresh: …. Showing the last result.` line.
- `limits-refresh` re-checks both providers with `Refresh` (the note reads `Checking…`, then `Checked just now`). The server keeps each result for 60 s and shares one check between concurrent requests. `?refresh=1` skips the 60 s cache.
- `limits-focus` returns focus to `open-limits` after `Close limits` or Escape.

## How to get to it (user POV)

- Sidebar `Limits` (the gauge, top, between the gear and `+`), on desktop or phone.

## Driving it with control-fabs

Preconditions:

- A launched instance. The checks use the real `claude` and `codex` logins on this PC. They are read-only and cost nothing.

Handles: the sections are `section[aria-labelledby=limits-claude]` and `section[aria-labelledby=limits-codex]` (ARIA `region "Claude Code"` / `region "Codex"`). Inside a window card `W` (`[role=group][aria-label=Weekly]`): the pace icon is `W span[role=img][tabindex]`, the bar is `W div[role=img]`, the countdown is `W [role=img] + span[tabindex]`, the reset-credits line is `W p`.

- **Open.** `$C browser click --role button --name "Limits"`, `$C browser wait --role group --name "Weekly"`. Snapshot `--role dialog --name "Limits"`: both regions are there with no navigation.
- **Tooltips.** `browser eval` `.focus()` on the pace icon, the countdown, or the expiry in the reset-credits line, then `$C browser text --role tooltip` reads the pace label or the exact time.
- **Layout.** With `browser eval`, compare bounding boxes: the bar is right of the `.text-3xl` percent on desktop and below it at 430px, the fill width over the bar width matches `% left`, the tick's centre matches `% of the window left`, the badge sits inside the bar's right end, and the Codex `W p` top is at or below the bar's bottom.
- **Refresh.** Click `--role button --name "Refresh"`: the header status reads `Checking…`, then `Checked just now`.
- **Close.** `Close limits` or Escape: no dialog, focus is `open-limits`.
- **Phone.** At `--viewport 430x932` the dialog box is `0,0,430,932` with no radius, and the bar is below the percent.
- **Dark.** `browser eval "localStorage.setItem('theme','dark')"`, then `browser open /`. Repeat the checks; the tick is the light foreground colour.
- **Not installed.** `$C api PUT /api/providers/codex '{"binaryPath":"/nonexistent/codex"}'`, then `Refresh`: the Codex section reads `isn't installed`. Reset with `'{"binaryPath":""}'` and `Refresh`.
- **Error keeps last result.** With results showing, `$C server stop`, `Refresh`: each section shows `Couldn't refresh: Failed to fetch. Showing the last result.` above its cards. `$C server start` afterwards.
- **Cache.** Two plain `$C api GET /api/providers/claude/limits` return the same `checkedAt`; `?refresh=1` returns a newer one; two parallel `?refresh=1` share one `checkedAt`.

## Gotchas

- Results are cached per provider config. Changing a binary path is a new config, so a broken path shows an error card, not the last result. Use `server stop` to prove the keep-last-result path.
- Opening Limits uses the cached result for up to 60 s. After changing a binary path, press `Refresh`.
- `localStorage` is only reachable once a page is open; run `browser open /` before setting the theme.
- While Limits is open, `--role button --name "Limits"` would also match `Close limits`. Click the gauge from the chat view only.
- Percentages move between runs; assert on `% left` and the window labels, not exact numbers.
