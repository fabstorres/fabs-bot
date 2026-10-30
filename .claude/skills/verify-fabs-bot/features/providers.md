# Providers

Users manage the agent CLIs their bots run on this PC from one place. Sidebar → Providers opens a dialog with the CLIs on the left (version, status, and an on/off switch) and the selected CLI's settings on the right: status and resolved binary, display name, binary path, launch arguments, environment variables, and suggested models. Fields save when they lose focus, and every bot run on that CLI uses them. Fabs Bot stores them itself and never edits the CLIs' own configs. A CLI that is switched off disappears from the bot editor's Brain picker, except for bots already using it.

## Sub-features

- `providers-list` lists every CLI with its version and `Ready · full team tools`, `Ready · chat + workspace`, `Not installed`, `Binary not found`, or `Off`.
- `providers-icons` shows each CLI's actual logo in its list row and selected settings header.
- `providers-settings` saves display name, binary path, launch arguments, and environment variables on blur and keeps them across a reload.
- `providers-run` makes the next bot run use the binary path, put the launch arguments before Fabs Bot's own flags, and set the environment variables.
- `providers-env-name` flags an invalid variable name inline, doesn't save it, and clears the warning once the name is fixed or the row is removed.
- `providers-switch` hides a CLI that's turned off from the Brain picker, but keeps it for a bot that already runs on it.
- `providers-name` shows the display name in the list, the details header, and the Brain picker.
- `providers-phone` stacks the list above the details at 430px.

## How to get to it (user POV)

- Sidebar footer `Providers`, on desktop or phone.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README. `providers-run` needs a logged-in `claude`.
- For `providers-run`, write a wrapper in the run dir (`$C paths` → `runDir`) that appends `"$1 $2 $3 | FABS_PROBE=$FABS_PROBE"` to `<runDir>/wrapper.log` and then `exec`s the real `claude` with `"$@"`.

- **Open.** Run `$C browser click --role button --name "Providers"` and `$C browser wait --role region --name "Claude Code settings"`. `--role group --name "Agent CLIs"` holds one button and one `Enable <CLI>` switch per CLI. Capture `providers/open.aria.txt` plus `.png`.
- **Logos.** Select Claude Code, Codex, Cursor Agent, OpenCode, and Gemini CLI in turn. Each header must show the same SVG logo as its list row, with no letter tiles. Repeat at 430px and capture the list plus the selected header. Logos are decorative: CLI names and switch labels must remain accessible.
- **Settings.** Fill `--label "Display name"`, `--label "Binary path"` (the wrapper), and `--label "Launch arguments"` (` --debug-file <runDir>/claude-debug.log`, with a leading space), pressing `Tab` after each. Click `Add variable`, fill `--label "Variable 1 name" --value "FABS_PROBE"` and `--label "Variable 1 value" --value "providers-ok"`, then `Tab`. The region is renamed to `<display name> settings`, and `$C api GET /api/providers` shows the four values under `settings` for `claude`.
- **Run.** Open `Bot Chief` and ask it to run `echo "probe=$FABS_PROBE"` with its Bash tool. `$C wait <T> --for idle` passes, `$C thread <T>` shows `[tool Bash done] "probe=providers-ok"`, `wrapper.log` ends with `--debug-file <runDir>/claude-debug.log -p | FABS_PROBE=providers-ok`, and `claude-debug.log` exists.
- **Bad name.** Click `Add variable`, fill `--label "Variable 2 name" --value "1BAD"`, and press `Tab`. `--role alert` names `"1BAD"`, and the API still shows only `FABS_PROBE`. `$C browser click --role button --name "Remove 1BAD"` hides the alert.
- **Switch.** Click `--role switch --name "Enable Codex"` and `"Enable Gemini CLI"`. Their rows read `Off`, and the API shows `"enabled": false`. In `Edit Chief`, the `Brain` radiogroup lists no Codex or Gemini. In `Edit Engineer` (a Codex bot), Codex is still there and checked.
- **Reload.** `$C browser open /`, then reopen Providers. Every field and switch reads back the same.
- **Proof.** Capture `providers/*.aria.txt` plus `.png` for each step, the thread dump, and `wrapper.log` with the run dir redacted.

## Gotchas

- `control-fabs` reads a value that starts with `--` as a flag. Type launch arguments with a leading space; the app trims it.
- Fields save on blur. Typing without leaving the field saves nothing.
- Every save re-checks that one CLI's version, so the wrapper logs a `--version` line per save. Only the line with `-p` is a bot run.
- Plugins → Scan also starts Claude through these settings. Expect one more `-p` line in `wrapper.log` after a scan.
- Engineer's desk opens on its files page. Click `Show settings` before `Edit Engineer`.
