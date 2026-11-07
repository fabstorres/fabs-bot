# Pairing and access

Fabs Bot is reachable only from the PC itself and from the user's Tailscale network, never from the LAN. A device on the tailnet sees "Not paired yet" until it opens a pairing link. On the PC, `Settings` → `This PC` → `Pair a device` makes a link and QR code that works once and expires after 5 minutes. Opening it gives that device its own sign-in, which lasts until the device is removed under `Paired devices`. Removing a device signs out only that device, at once, and closes its live connection. The endpoint the bots call back into is loopback-only, so no remote device can impersonate a bot.

## Sub-features

- `access-loopback` lets the PC's own browser use the app without pairing.
- `access-unpaired` shows "Not paired yet" to a tailnet browser without a sign-in, and refuses API calls (401).
- `access-pair` makes a pairing link only when asked. The link sets a per-device cookie and redirects into the app. It works once and expires after 5 minutes. A wrong, reused or expired code is refused. A device token works as a cookie or bearer header, never as `?token=`.
- `access-retired-token` refuses the shared token that older builds gave every device: as an old `/pair?token=` link, a cookie, or a bearer header.
- `access-devices` lists paired devices in Settings → This PC (label, paired, last seen, `This device`), and updates while it is open. Neither the list nor any API returns a token. `Remove` signs out that device only: its API calls get 401, its open WebSocket closes, and an open app shows "Not paired yet".
- `access-mcp-local` refuses the bot MCP endpoint from anything but loopback.
- `access-panel` shows the Fabs Bot version, Tailscale status, peers, `Pair a device`, `Paired devices`, and the Tailscale HTTPS switch in Settings → This PC.

## How to get to it (user POV)

- On the PC, open `http://127.0.0.1:4800` (port 4870+ for a verification run).
- On the PC, choose `Settings` (bottom of the sidebar) → `This PC`, then `Pair a device` to see a QR code and a one-time pairing link.
- On a phone or laptop on the tailnet, scan the QR code or open the pairing link within 5 minutes.
- On the PC or any paired device, choose `Settings` → `This PC` and use `Remove` next to a device under `Paired devices`.

## Driving it with control-fabs

Preconditions:

- Launched with `$C launch --tailnet`, and `$C doctor` reports `tailscale running, instance also bound to tailnet`.
- This recipe never prints or screenshots the tailnet hostname, IP, pairing code, or device token. The harness resolves and redacts them. `browser pair` and `--value @pair-link` each make a fresh one-time link through the loopback API.

- **Auth matrix.** Run `$C pair-check`. All 23 lines read `ok`. It checks: unpaired 401; a wrong code and an old `?token=` link 403; a link that pairs once (302 with a `fabs_token` cookie), then 403 the second time; a second device that gets its own token; the device cookie 200, its token as `?token=` 401, as a bearer header 200; the retired shared token as a cookie or bearer 401; `/api/host` and the device list with no token; `devices.json` with no token and mode 600; a device's open WebSocket that closes with code 1008 when the device is removed, its cookie 401 after, and the other device still 200; then the MCP, owner-header, cross-origin and non-JSON rows. It removes the devices it paired. The matrix is saved to `pairing/pair-check.txt`.
- **Expiry.** Run `$C pair-check --expiry` once when pairing changes. It waits 5 minutes, then adds `a pairing link is refused after 5 minutes`.
- **Retired token.** The retired-token rows use `<dataDir>/access-token` when the data dir has one, as an install upgraded from an older build does. A fresh data dir has none, so they use a stand-in value.
- **Loopback.** Run `$C browser open /` and `$C browser wait --role button --name "Settings"`. The sidebar loads with no pairing.
- **Unpaired over the tailnet.** The browser has no cookie yet (loopback never sets one). Run `$C browser open / --via tailnet` and `$C browser wait --role heading --name "Not paired yet"`. Capture `pairing/unpaired.aria.txt`.
- **Pair.** Run `$C browser pair`, then `$C browser wait --role button --name "Settings"`. The app loads over the tailnet. Run `$C browser open / --via tailnet` again; it still loads, so the cookie persisted. Capture `pairing/paired.aria.txt`.
- **Device list.** Click `Settings`, then the `This PC` section in the settings nav, and snapshot `--role region --name "Paired devices"`. It lists `Chrome on Linux` with `This device`.
- **Pairing link.** Snapshot `--role group --name "Pair your phone or laptop"`: only `Pair a device`. Click `--role button --name "Pair a device"` and wait for `Copy pairing link`. The snapshot shows the link with `code=•••••`, `Works once, until <time>`, `New link`, and `Copy pairing link`.
- **Live update.** With This PC open, pair a second client from a script: `POST /api/pairing-links` on the run's loopback URL, then open the returned `url` with an iPhone Safari user agent, never printing it. `--role button --name "Remove Safari on iPhone"` appears without a reload.
- **Remove another device.** Hold that client's WebSocket open, then click `Remove Safari on iPhone`. The socket closes with code 1008 `device removed`, its cookie gets 401, and a new WebSocket is refused. The row leaves the list.
- **Remove this device.** Click `Remove Chrome on Linux`. The open app shows `Not paired yet` without reloading, and still does after `browser open / --via tailnet`.
- **Panel.** Over loopback, `Paired devices` reads `No devices yet.` once every device is removed. Snapshot only the `Paired devices` region and the `Pair your phone or laptop` group, never the whole section: it lists peer device names.
- **Version.** With the panel open, run `$C browser snapshot --text "v<version>" --path pairing/version.aria.txt`, where `<version>` is `version` in `package.json`. `$C logs` starts with `fabs-bot <version>`.
- **Proof.** `pairing/pair-check.txt`, the snapshots above, and the socket probe's output. Run `$C privacy-check` before sharing any of them.

## Gotchas

- Over loopback every request is trusted, so a browser on `127.0.0.1` can never show "Not paired yet". Use `--via tailnet` for the unpaired path.
- `browser start` reuses the run's profile. Remove the device from `Paired devices`, delete the profile, or relaunch the run to get back to an unpaired state.
- `launch` without `--tailnet` is loopback-only, so `pair-check`, `--via tailnet`, and `browser pair` refuse to run.
- Pairing codes live in memory. Restarting the server (`$C server stop|start`) throws away links that haven't been used yet; paired devices stay.
- `$C api POST /api/pairing-links` prints the link redacted, so it can't pair anything. A script that pairs a client reads `.url` from the loopback API itself and never prints it.
- The This PC section prints the real tailnet hostname and lists peers. Never capture it unmasked, and never paste `$C api GET /api/host` output into a PR. Hostnames and IPs are redacted, but it still lists your peer device names; prefer `doctor`.
- Requests through Tailscale HTTPS need a device sign-in too; the Tailscale login header earns nothing. Never turn it on against the real `tailscale`. Prove it with [tailscale-https](./tailscale-https.md), which runs on the simulated serve config.
