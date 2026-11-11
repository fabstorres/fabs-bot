# Plugin sign-in

An HTTP plugin added in Fabs Bot that answers 401 with OAuth metadata needs a sign-in. Fabs Bot holds that sign-in on this PC: it registers itself with the service (or uses a client ID from Edit), sends you to the service's approval page, keeps and renews the tokens, and hands the token to every bot the plugin is turned on for, on any provider. The row in Settings → Plugins shows the sign-in state, and the Bot access table under it shows whether each bot's own CLI can reach the plugin's tools. A bot whose plugin isn't signed in runs without it and can tell you where to fix it.

## Sub-features

- `signin-detect` marks an OAuth plugin `Needs sign-in`, a server that wants credentials without offering sign-in or that can't be reached `Can't connect` with the reason under the name, and a plain server with the `Added` check.
- `signin-local` on the PC: `Sign in to <name>` → `Open sign-in page` → approve in the new tab → the tab reads `Signed in to <name>` and the dialog `Signed in to <name>.`.
- `signin-paste-back` over the tailnet without Tailscale HTTPS: the dialog adds `Address after approving`; the approval page sends the browser to `http://127.0.0.1:<port>/oauth/callback?…`, and pasting that address finishes sign-in.
- `signin-https` with Tailscale HTTPS on: the service sends the browser straight back to the HTTPS address, with or without a paired cookie.
- `signin-fail` shows the reason in an alert (cancelled, refused, unreachable) and never a token.
- `signin-refresh` renews a token before turns and checks; a refused renewal or a refused token flips the row to `Sign-in expired` with `Reconnect`.
- `signin-revoke` `Revoke access` revokes at the service, empties the row back to `Needs sign-in`, and every bot reads `Authentication required`.
- `signin-client` a service without automatic registration asks for a client ID; Edit takes `OAuth client ID` and `Client secret` (stored on this PC, never shown again).
- `bot-access` one row per bot and HTTP plugin: `Ready, <n> tool(s)` from that bot's own CLI (Claude Code's MCP status, Codex's app-server), `Authentication required`, `Can't connect`, `Checking…`; `Check <Bot> with <name>` checks again.
- `signin-turn` a bot turn after sign-in calls the plugin's tool; a turn while it needs sign-in runs without it and the bot says where to fix it.

## How to get to it (user POV)

- Sidebar gear → `Plugins` → an HTTP row added in Fabs Bot → `Sign in` / `Reconnect`, or its `<name> options` menu.
- The same section's `Bot access` table, and `Edit` on the row for a client ID.
- From a phone or laptop over the tailnet, the same section (paste-back), or over Tailscale HTTPS (straight back).

## Driving it with control-fabs

Preconditions:

- A launched instance, a logged-in `claude`, and `codex` for the Codex row. Never sign in to a real service and never use the user's own plugins.
- `$C claude-creds --path plugin-sign-in/creds-before.txt` before the first bot run; repeat after and compare. Never give Claude an OAuth plugin without a token header by any other route, and don't run a Claude bot turn with an OAuth plugin on a `main` build: Claude then signs in on its own and writes to its credential file.

- **Test server.** `$C oauth-mcp start --port <your block + 5> --ttl 90`. Add plugins with `$C api POST /api/connectors '{"name":"Test MCP","preset":"custom","kind":"http","url":"http://127.0.0.1:<p>/mcp","headers":{}}'` (also `/nometa/mcp` for a server without sign-in, `/open/mcp` for one without auth, and a closed port for an unreachable one). Turn Test MCP on for a Claude and a Codex bot with `$C api PUT /api/bots/<id> '{"connectorIds":["<id>"]}'`.
- **Needs sign-in.** Open Plugins: `Test MCP Web Custom Needs sign-in` with `"Sign in to Test MCP"`; Bot access rows read `Authentication required`.
- **Sign in on the PC.** Click `"Sign in to Test MCP" --exact`, wait for `--role link --name "Open sign-in page"`, click it, then `$C browser click --tab /authorize --role button --name "Approve" --exact`, `$C browser wait --tab /oauth/callback --role heading --name "Signed in to Test MCP"`, `$C browser close --tab /oauth/callback`, and `$C browser wait --text "Signed in to Test MCP."`. Bot access rows go `Checking…` then `Ready, 1 tool` for both bots.
- **Fail.** The same, with `"Deny"`: the tab reads `Sign-in didn't finish`, the dialog shows `--role alert` `Sign-in to Test MCP was cancelled.`.
- **One bot only.** Point Codex at a wrapper that sets `FABS_MCP_TOKEN_1` to a wrong value (`$C api PUT /api/providers/codex '{"binaryPath":"<wrapper>"}'`), click `"Check Engineer with Test MCP"`: Engineer reads `Authentication required` while the Claude bot stays `Ready`. Clear `binaryPath` afterwards.
- **Turns.** In each bot's chat ask it to call `secret_word` from Test MCP: the thread shows `[tool test mcp · secret_word done]` (Codex: `test_mcp · secret_word`). Before sign-in the bot says Test MCP needs sign-in in Settings → Plugins.
- **Refresh and expiry.** With `--ttl 90`, wait over 30 s and run a check or turn: `$C oauth-mcp state` counts a `refreshed`. `$C oauth-mcp expire --refresh` then a check: the row reads `Sign-in expired` with `"Reconnect to Test MCP"`; reconnecting brings both bots back to `Ready`.
- **Revoke.** `"Test MCP options"` → `Revoke access`: a toast says the bots lost access, the row reads `Needs sign-in`, and `$C oauth-mcp state` counts `revoked`.
- **Paste-back.** Launch with `--tailnet`, `$C browser pair`, `$C browser open / --via tailnet`, then sign in: the dialog shows `--label "Address after approving"`. Approve, paste the `127.0.0.1` address the approval page redirects to, click `"Finish sign-in"`.
- **Tailscale HTTPS.** Launch with `--tailnet --tailscale-shim` and turn Tailscale HTTPS on. The shim copies the real serve config, so if `:8443` is already taken there, remove that mapping from `<run>/tailscale-shim/serve.json` (the copy only) first. Start sign-in through `http://127.0.0.1:<port+1>` with a paired cookie: `pasteBack` is false and the redirect address is the HTTPS one. Keep that address out of output and images.
- **Client ID.** `bun .claude/skills/verify-fabs-bot/scripts/oauth-mcp.ts --port <p> --no-register` in the background: sign-in fails with `doesn't register apps on its own`; Edit → `OAuth client ID` `fabs-test-client`, `Client secret` `fabs-test-secret` → `Save` → sign in works.
- **Phone.** At `--viewport 430x932` both `[data-slot=table-container]` elements have `scrollWidth == clientWidth`.

## Gotchas

- The sign-in link opens a new tab. Drive it with `--tab /authorize` and `--tab /oauth/callback`; `--tab` matches the tab's address.
- A test server restarted under a running instance has forgotten Fabs Bot's registration: the first sign-in shows `Unknown app or redirect address`, the next one registers again.
- `/test/expire` makes the test server refuse tokens before their stated expiry. Fabs Bot only notices on the next check or turn.
- Snapshots of the callback tab carry `state=` in their header line; the code is redacted. Neither is reusable.
