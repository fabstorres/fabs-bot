# Providers

Users manage the agent CLIs their bots run on this PC from one place. Settings → Providers shows the CLIs on the left (version, status, and an on/off switch) and the selected CLI's settings on the right: status and resolved binary, display name, binary path, launch arguments, environment variables, and a Default model picker. Fields save when they lose focus, and every bot run on that CLI uses them. The Default model picker lists `CLI default`, the CLI's recent models, its legacy models, and `Custom model…`; every new bot on that CLI starts on the model picked there. Fabs Bot stores them itself and never edits the CLIs' own configs. A CLI that is switched off disappears from the bot editor's Brain picker, except for bots already using it. The list shows the last-known status at once and re-checks every CLI in the background.

## Sub-features

- `providers-instant` shows the last-known list at once while the button reads `Checking…`, then updates the rows in place and reads `Checked <time>`, also right after a reload.
- `providers-list` lists every CLI with its version and `Ready · full team tools`, `Ready · chat + workspace`, `Not installed`, `Binary not found`, or `Off`.
- `providers-icons` shows each CLI's actual logo in its list row and selected settings header.
- `providers-settings` saves display name, binary path, launch arguments, and environment variables on blur and keeps them across a reload.
- `providers-run` makes the next bot run use the binary path, put the launch arguments before Fabs Bot's own flags, and set the environment variables.
- `providers-env-name` flags an invalid variable name inline, doesn't save it, and clears the warning once the name is fixed or the row is removed.
- `providers-switch` hides a CLI that's turned off from the Brain picker, but keeps it for a bot that already runs on it.
- `providers-name` shows the display name in the list, the details header, and the Brain picker.
- `providers-default-model` saves the Default model picked from the `Recent` or `Legacy` group, or typed under `Custom model…`, keeps it across a reload, and gives it to every new bot on that CLI.
- `providers-phone` stacks the list above the details at 430px.

## How to get to it (user POV)

- Sidebar `Settings` (top, next to `+`): desktop opens on `Providers`; at 430px tap `Providers` in the section list.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README. `providers-run` needs a logged-in `claude`.
- For `providers-run`, write a wrapper in the run dir (`$C paths` → `runDir`) that appends `"$1 $2 $3 | FABS_PROBE=$FABS_PROBE"` to `<runDir>/wrapper.log` and then `exec`s the real `claude` with `"$@"`.

- **Open.** Run `$C browser click --role button --name "Settings"`. At 430px Settings opens on its section list, so also run `$C browser click --role button --name "Providers"`. Then `$C browser wait --role region --name "Claude Code settings"`. `--role group --name "Agent CLIs"` holds one button and one `Enable <CLI>` switch per CLI. Capture `providers/open.aria.txt` plus `.png`.
- **Instant.** Save the script below as `<runDir>/instant.js`. From a chat at 1440x900, run `$C browser eval "$(cat <runDir>/instant.js)"`. It clicks Settings and times, with a `MutationObserver`, when the first row is in the DOM and when the background check ends. The first row is there within tens of ms with `checkingAtFirstRow: true`, and the check ends about as long after as the slowest CLI's `--version` takes. Click `Close settings`, run `$C browser open /`, and run it again. At 430px, from the bot list, click `Settings`, then run `$C browser eval "$(sed 's/OPEN = "gear"/OPEN = "providers"/' <runDir>/instant.js)"`. Save the three results to `providers/instant.txt`.
  ```js
  (async () => {
    const OPEN = "gear";
    const has = (test) => new Promise((done) => {
      if (test()) return done();
      const obs = new MutationObserver(() => test() && (obs.disconnect(), done()));
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    const checking = () => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Checking…"));
    const target = OPEN === "gear"
      ? document.querySelector('button[aria-label="Settings"]')
      : [...document.querySelectorAll('nav[aria-label="Settings sections"] button')].find((b) => b.textContent.trim() === "Providers");
    const t0 = performance.now();
    target.click();
    await has(() => document.querySelector('[aria-label="Agent CLIs"] button'));
    const firstRowMs = Math.round(performance.now() - t0);
    const checkingAtFirstRow = checking();
    await has(() => !checking());
    return { origin: location.origin, firstRowMs, checkingAtFirstRow, checkDoneMs: Math.round(performance.now() - t0) };
  })()
  ```
- **Logos.** Select Claude Code, Codex, Cursor Agent, OpenCode, and Gemini CLI in turn. Each header must show the same SVG logo as its list row, with no letter tiles. Repeat at 430px and capture the list plus the selected header. Logos are decorative: CLI names and switch labels must remain accessible.
- **Settings.** Fill `--label "Display name"`, `--label "Binary path"` (the wrapper), and `--label "Launch arguments"` (` --debug-file <runDir>/claude-debug.log`, with a leading space), pressing `Tab` after each. Click `Add variable`, fill `--label "Variable 1 name" --value "FABS_PROBE"` and `--label "Variable 1 value" --value "providers-ok"`, then `Tab`. The region is renamed to `<display name> settings`, and `$C api GET /api/providers` shows the four values under `settings` for `claude`.
- **Run.** Open `Bot Chief` and ask it to run `echo "probe=$FABS_PROBE"` with its Bash tool. `$C wait <T> --for idle` passes, `$C thread <T>` shows `[tool Bash done] "probe=providers-ok"`, `wrapper.log` ends with `--debug-file <runDir>/claude-debug.log -p | FABS_PROBE=providers-ok`, and `claude-debug.log` exists.
- **Bad name.** Click `Add variable`, fill `--label "Variable 2 name" --value "1BAD"`, and press `Tab`. `--role alert` names `"1BAD"`, and the API still shows only `FABS_PROBE`. `$C browser click --role button --name "Remove 1BAD"` hides the alert.
- **Default model.** In `Claude Code settings`, `--role combobox --name "Default model"` reads `CLI default`. Click it. The open `--role listbox` holds `CLI default`, `--role group --name "Recent"` and `--role group --name "Legacy"` of `--role option`s, and `Custom model…`. Click `--role option --name "Claude Haiku 5.5"`. The combobox reads `Claude Haiku 5.5`, and `$C api GET /api/providers` shows `"defaultModel": "claude-haiku-5-5"` for `claude`. Click `New bot`, fill `--label "Name" --value "Scout"`, and click `Get started`. `$C api GET /api/bots` lists `Scout` with `"model": "claude-haiku-5-5"`, and `Edit Scout` reads `Claude Haiku 5.5` in its `Model` combobox. Back in Providers, pick `Custom model…`, fill `--label "Default model ID" --value "claude-test-id"`, and press `Tab`; the API shows that ID. Pick `CLI default` and the API shows `"defaultModel": ""`. Repeat the pick for Codex. Capture `providers/default-model.*` at 1440x900 and 430x932, and `providers/default-model-open.*` at 1440x900.
- **Switch.** Click `--role switch --name "Enable Codex"` and `"Enable Gemini CLI"`. Their rows read `Off`, and the API shows `"enabled": false`. In `Edit Chief`, the `Brain` radiogroup lists no Codex or Gemini. In `Edit Engineer` (a Codex bot), Codex is still there and checked.
- **Reload.** `$C browser open /`, then reopen Settings → Providers. Every field and switch reads back the same.
- **Proof.** Capture `providers/*.aria.txt` plus `.png` for each step, the thread dump, and `wrapper.log` with the run dir redacted.

## Gotchas

- `control-fabs` reads a value that starts with `--` as a flag. Type launch arguments with a leading space; the app trims it.
- Fields save on blur. Typing without leaving the field saves nothing.
- Every save re-checks that one CLI's version, so the wrapper logs a `--version` line per save. Only the line with `-p` is a bot run.
- Plugins → Scan also starts Claude through these settings. Expect one more `-p` line in `wrapper.log` after a scan.
- A save made while `Checking…` shows waits for that check to finish, so a switch can take a second to flip.
- A CLI whose `--version` doesn't finish in 5 s is cut off and listed without a version. The check, and any save waiting on it, ends by then.
- Time row presence with a `MutationObserver`, never `requestAnimationFrame`. A freshly started headless browser can hold back frames for about a second, which reads as app latency.
- Engineer's desk opens on its files page. Click `Show settings` before `Edit Engineer`.
- Model names match as substrings, so `--name "Claude Opus 5"` also hits `Claude Opus 5.5`. Pass `--exact` for those.
- The open model list renders outside the settings region. Target `--role listbox` or `--role option` directly, not inside `Claude Code settings`.
- Changing the Default model doesn't touch existing bots. Only bots created after it start on the new model.
