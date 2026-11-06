# Tailscale HTTPS

Settings → This PC has a Tailscale HTTPS switch. Turning it on serves the app at `https://<pc>.<tailnet>.ts.net:<port>` (8443 unless `FABS_TAILSCALE_SERVE_PORT` says otherwise), so phones get the mic and install-to-home-screen. Devices still pair once; while it's on, the QR code and pairing link use the HTTPS address. Turning it off removes only that port. Fabs Bot never touches 443 or a port another app already serves; it refuses and says why. Requests through HTTPS are never trusted as this PC: they need a device sign-in from a pairing link, whatever Tailscale login header they carry, and the bot MCP endpoint refuses them.

## Sub-features

- `https-toggle-on` turns on HTTPS from the panel and shows the HTTPS address.
- `https-toggle-off` turns it off and removes only Fabs Bot's port.
- `https-coexist` leaves other apps' serve ports alone, including one on 443.
- `https-port-taken` refuses when another app holds the port, makes no serve change, and leaves the switch off.
- `https-cli-error` shows a fix (for example `tailscale set --operator`) when Tailscale refuses.
- `https-stop` removes only Fabs Bot's port when the server gets SIGINT or SIGTERM, keeps the switch on, and puts the port back on the next start. Another app's mapping on the port is left alone.
- `https-auth` pairs a device through a one-time link opened over HTTPS, and refuses that link the second time. It admits the device's cookie or bearer token, with or without the owner's Tailscale login header. It refuses requests with no identity (tagged devices, Funnel), another user's, the owner's login without pairing, the device token as `?token=`, and the retired shared token, and refuses the bot MCP endpoint.

## How to get to it (user POV)

- On the PC, choose `Settings` (bottom of the sidebar) → `This PC`, then flip `Tailscale HTTPS`.
- From another device, open the HTTPS address shown under the switch.

## Driving it with control-fabs

Preconditions:

- Launch with `$C launch --tailnet --tailscale-shim`. The shim simulates `tailscale serve`, starting from the user's real serve config, so the user's Tailscale never changes. Never flip the switch on an instance launched without it.
- `$C doctor` reports `tailscale serve is simulated by the shim`.

- **Off.** Run `$C browser click --role button --name "Settings"` and `$C browser click --role button --name "This PC"`, then `$C browser wait --role switch --name "Tailscale HTTPS"`. Capture `tailscale-https/1-off.aria.txt` with `--role group --name "Tailscale HTTPS"`, and `.png`. Run `$C serve-shim state --path tailscale-https/1-serve-before.txt`, which lists the user's existing mappings only.
- **On.** Run `$C browser click --role switch --name "Tailscale HTTPS"` and `$C browser wait --text "The QR code and pairing link use this address"`. Capture `2-on`. `$C serve-shim state` adds exactly `https :8443 → http://127.0.0.1:<port+1>`, and every earlier line is unchanged.
- **Auth.** Run `$C serve-check`. All twelve lines read `ok`; the matrix is saved to `tailscale-https/serve-check.txt`. It pairs one device through the HTTPS listener and removes it at the end.
- **Off again.** Click the switch and wait for `Other apps using Tailscale HTTPS are left alone`. `$C serve-shim state` is back to the "before" list.
- **CLI error.** Run `$C serve-shim fail "Access denied: serve config denied"`, click the switch, and wait for `Tailscale refused`. The switch is unchecked. Capture `4-permission-denied`.
- **Port taken.** Run `$C serve-shim occupy 8443`, click the switch, and wait for `Another app already uses this HTTPS port`. `$C serve-shim state` still shows the other app's `:8443` mapping. Capture `5-port-taken`.
- **Stop and start.** With the switch on, run `$C browser stop`, then `kill -TERM <pid>` using the `pid` from `$FABS_VERIFY_HOME/<run>/state.json` (not `cleanup`, which deletes the run dir). `$C serve-shim state` drops the `:8443` line, and the `settings` row `tailscale.serve` in `<run>/data/fabs-bot.db` is still `1`. Run `$C launch --run-id <run> --port <port> --tailnet --tailscale-shim --no-build` to start again on the same data. The `:8443` line comes back and the switch is still on. Repeat with `$C serve-shim occupy 8443` before the kill: the other app's `:8443` line survives.
- **Proof.** Run `$C serve-shim log --path tailscale-https/serve-calls.txt`. The only changes are `serve --bg --https=8443 http://127.0.0.1:<port+1>` and `serve --https=8443 off`, with none after `occupy`.

## Gotchas

- The panel shows tailnet peers and the HTTPS address. Snapshot `--role group --name "Tailscale HTTPS"`, not the whole dialog. Screenshots mask peers, the address, the QR, and the pairing link by default.
- The shim proves the commands Fabs Bot runs. It can't prove that real HTTPS certificates work, or that another device reaches the PC. Say so when reporting.
- `serve-check` calls the HTTPS listener directly, the way `tailscale serve` would. It needs the switch to be on (the listener binds on first use).
- Pairing links carry a one-time `?code=` on `/pair`, made only when someone chooses `Pair a device`. Startup logs direct users to This PC without printing a link, code, or tailnet hostname.
