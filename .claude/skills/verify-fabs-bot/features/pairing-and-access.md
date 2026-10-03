# Pairing and access

Fabs Bot is reachable only from the PC itself and from the user's Tailscale network, never from the LAN. A device on the tailnet sees "Not paired yet" until it opens the PC's pairing link (QR code in the "This PC" panel). After that the device stays signed in. The endpoint the bots call back into is loopback-only, so no remote device can impersonate a bot.

## Sub-features

- `access-loopback` lets the PC's own browser use the app without pairing.
- `access-unpaired` shows "Not paired yet" to a tailnet browser without the cookie, and refuses API calls (401).
- `access-pair` makes the pairing link set a long-lived cookie and redirect into the app; a wrong token is refused.
- `access-mcp-local` refuses the bot MCP endpoint from anything but loopback.
- `access-panel` shows Tailscale status, peers, a QR code, and the optional `tailscale serve` command in the This PC panel.

## How to get to it (user POV)

- On the PC, open `http://127.0.0.1:4800` (port 4870+ for a verification run).
- On the PC, choose `This PC` (top-left) to see the QR code and the pairing link.
- On a phone or laptop on the tailnet, scan the QR code, or open the pairing link once.

## Driving it with control-fabs

Preconditions:

- Launched with `$C launch --tailnet`, and `$C doctor` reports `tailscale running, instance also bound to tailnet`.
- This recipe never prints or screenshots the tailnet hostname, IP, or token. The harness resolves and redacts them.

- **Auth matrix.** Run `$C pair-check`. All five lines read `ok`: unpaired API 401, wrong token 403, pairing link 302 with a `fabs_token` cookie, paired API 200, and MCP from the tailnet 403. The matrix is saved to `pairing/pair-check.txt`.
- **Loopback.** Run `$C browser open /` and `$C browser wait --role button --name "This PC"`. The field loads with no pairing.
- **Unpaired over the tailnet.** The browser has no cookie yet (loopback never sets one). Run `$C browser open / --via tailnet` and `$C browser wait --role heading --name "Not paired yet"`. Capture `pairing/unpaired.aria.txt` plus `.png`.
- **Pair.** Run `$C browser pair`, then `$C browser wait --role button --name "This PC"`. The app loads over the tailnet. Run `$C browser open / --via tailnet` again; it still loads, so the cookie persisted. Capture `pairing/paired.aria.txt` plus `.png` (the host chip is masked).
- **Panel.** Over loopback, run `$C browser click --role button --name "This PC"` and `$C browser snapshot --role dialog --name "This PC" --path pairing/panel.aria.txt`. The snapshot names `Pair your phone or laptop`, `Copy pairing link`, and `tailscale serve --bg <port>`, with the link redacted. If you screenshot it, keep the default mask.
- **Proof.** `pairing/pair-check.txt`, the unpaired and paired snapshot pairs, and `pairing/panel.aria.txt`. Run `$C privacy-check` before sharing any of them.

## Gotchas

- Over loopback every request is trusted, so a browser on `127.0.0.1` can never show "Not paired yet". Use `--via tailnet` for the unpaired path.
- `browser start` reuses the run's profile. Delete it or relaunch the run to get back to an unpaired state.
- `launch` without `--tailnet` is loopback-only, so `pair-check`, `--via tailnet`, and `browser pair` refuse to run.
- The This PC panel prints the real tailnet hostname. Never capture it unmasked, and never paste `$C api GET /api/host` output into a PR. Hostnames and IPs are redacted, but it still lists your peer device names; prefer `doctor`.
- Requests through `tailscale serve` (HTTPS) are trusted by Tailscale identity instead of the cookie. That path needs the user to run `tailscale serve` themselves; never run it from verification.
