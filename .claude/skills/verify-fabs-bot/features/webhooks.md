# Outgoing webhooks

A group chat can have one outgoing webhook: an endpoint the user sets up, with an optional HMAC-SHA256 signature. When the user asks a bot in that group to send a task, the bot posts `{"requestId","task"}` to it and a delivery card in the bot's message says whether it was received or not delivered. Received only means the endpoint got it; the work isn't done and nothing comes back. The address and secret are write-only: after saving, the web client only learns that a webhook is set up, and bots never see either. A bot asked to set it up posts a card that opens the same dialog, so nothing secret is typed into chat.

## Sub-features

- `webhook-setup-card` lets a bot post a `Webhook setup` card (`setup_webhook`) whose `Set up webhook` button opens the dialog.
- `webhook-dialog` sets the endpoint from `More` → `Outgoing webhook` in a group (not in 1:1s): Endpoint URL and Signing secret are password fields, never prefilled after saving, with signature header, Hex / Base64 encoding and an optional prefix. Remove clears it.
- `webhook-write-only` keeps the address and secret out of every response the client gets, the thread dump, the server log and ARIA snapshots taken after saving.
- `webhook-send` delivers `{"requestId","task"}` from the bot that was asked (`send_webhook`), signed when signing is on, and shows `Received by the webhook` with the HTTP status and Fabs Bot's request id. Nothing from the receiver's reply is shown or passed to the bot.
- `webhook-errors` shows `Not delivered to the webhook` with `HTTP <code>`, a redirect that isn't followed, `No answer within 10 seconds`, or `Couldn't reach the endpoint`, never the response body.
- `webhook-retry` resends a failed delivery with the same request id so the receiver can drop duplicates. An id this group didn't send is refused.
- `webhook-ask` gives an "ask"-autonomy bot an `Approval: send_webhook` card first. Deny sends nothing.
- `webhook-refusals` makes `send_webhook` in a 1:1, or in a group with no webhook, fail with a pointer to `setup_webhook`.
- `webhook-delete` removes a group's webhook with the group.

## How to get to it (user POV)

- In a group chat, open `More` → `Outgoing webhook`.
- Ask a bot in a group to set up the webhook, then tap `Set up webhook` on its card.
- @mention a bot in a group and ask it to send a task to the webhook.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README. `Chief` (full autonomy) and `Careful` ("ask" autonomy) exist.
- A group with both, created through the API: `$C api POST /api/threads '{"botIds":["<Chief id>","<Careful id>"],"title":"Login bug"}'`. Call its id `<G>`.
- A loopback receiver on a free port inside your own port block, logging into the run dir: `bun .claude/skills/verify-fabs-bot/scripts/webhook-receiver.ts <port> <runDir>/receiver.jsonl` in the background (`$C paths` prints `runDir`). `curl "http://127.0.0.1:<port>/__mode?set=202|500|hang"` switches its answer. Never point the webhook at anything else.
- For the leak check, use marker values: URL `http://127.0.0.1:<port>/hooks/task-1/tok-TESTTOKEN`, secret `whsec-TESTSECRET`.

- **No webhook yet.** Open `Thread: Login bug`, fill the message, press `Control+Home`, `@`, click `--role option --name "Chief" --exact`, then `Enter`, with a message asking Chief to `send_webhook` a task. `$C wait <G> --for idle`. `$C thread <G>` shows `[tool fabsbot · send_webhook error "This group has no webhook set up yet…"]`, then `[tool fabsbot · setup_webhook done] [webhook-setup]`, and the chat shows `--role group --name "Webhook setup"`.
- **Set it up from the card.** Click `--role button --name "Set up webhook" --exact`; `--role dialog --name "Outgoing webhook"` opens with `--role status` `Not set up yet…`. Fill `--label "Endpoint URL"`, click `--role switch --name "Sign requests"`, fill `--label "Signing secret"` and `--label "Prefix (optional)"` (`sha256=`), click `Save`. The toast reads `Webhook saved`. `$C api GET /api/threads/<G>/webhook` returns only `configured: true` and the signing header, encoding and prefix.
- **Saved stays hidden.** Reopen from `More` → `--role menuitem --name "Outgoing webhook"`. Both password fields are empty with `Saved. Paste a new … to replace it.` placeholders, and `Remove` is shown.
- **Send.** Ask Chief to `send_webhook` a task. `$C thread <G>` shows `[webhook received "HTTP 202" request=fabs-…]`, even though the receiver answers with a `deliveryId`. The card `--role group --name "Webhook delivery"` reads `Received by the webhook` and `Received only. The work isn't done yet, and no reply comes back here.` The receiver log holds the body `{"requestId":"fabs-…","task":"…"}` and an `x-signature` equal to `sha256=` plus the hex HMAC-SHA256 of that exact body with the secret.
- **Failures.** Set the receiver to `500`, then `hang`, and ask for a send each time (add "don't retry on your own"). The cards read `Not delivered to the webhook` with `HTTP 500`, then `No answer within 10 seconds. It may still have arrived`, and the work log counts `1 failed`. For unreachable, point the webhook at a closed port in your block with `$C api PUT /api/threads/<G>/webhook '{"url":"http://127.0.0.1:<closed port>/hooks/x","signing":false}'`: `Couldn't reach the endpoint`.
- **Retry.** After the 500, set the receiver back to `202` and ask Chief to retry that failed send reusing its request_id. The receiver log shows the same `requestId` twice. Ask Chief to call `send_webhook` with `request_id` `fabs-made-up-123`: the tool errors with `isn't a request id this group sent` and the receiver log doesn't grow.
- **Ask autonomy.** @mention Careful to send a task. `$C wait <G> --for approval`; `--role group --name "Approval: send_webhook"` reads `Send to this group's webhook: <task>`. Click `Deny`: the receiver log doesn't grow and `$C thread <G>` shows `[approval send_webhook deny …]` and no webhook card. Ask again and `Allow`: a `received` card follows.
- **Refusals.** In `Thread with Chief` (the 1:1), ask Chief to call `send_webhook`: `[tool fabsbot · send_webhook error "Webhooks are set up per group chat, and this isn't one…"]`. That chat's `More` menu has no `Outgoing webhook`.
- **Remove and delete.** In the dialog, `Remove` sets `configured: false`. Deleting the group (`More` → `Delete thread` → `Delete`) removes its row: `sqlite3 "file:<dataDir>/fabs-bot.db?mode=ro" "SELECT count(*) FROM thread_webhooks WHERE thread_id='<G>'"` prints `0`, and `GET /api/threads/<G>/webhook` answers 404.
- **Leak check.** Grep `tok-TESTTOKEN`, `whsec-TESTSECRET` and the receiver port across the artifacts (ARIA snapshots, `$C thread` dumps, API responses), the WebSocket events (a loopback `ws://127.0.0.1:<port>/ws` client logging each frame for the whole run) and `<runDir>/server.log`. The only hits are the database and the receiver's own log.
- **Proof.** Capture `webhooks/setup-card`, `webhooks/dialog-saved`, `webhooks/received`, `webhooks/failed`, `webhooks/approval` as `.aria.txt` plus `.png`, and `$C thread <G>`.

## Gotchas

- Never take an ARIA snapshot of the dialog while the URL or secret is typed in: snapshots read password fields in clear text. Screenshots show dots.
- The delivery card's state line is a `--role status` with no accessible name; wait on it with `--text "Sending to the webhook"` (or `Received by…`, `Not delivered…`).
- The thread menu's accessible name is `More` (it's labelled by its trigger), so target it as `--role menu`.
- Deleting the open thread calls `history.back()`. In a fresh harness tab that lands on `about:blank`; run `$C browser open /` afterwards.
- `Home` in the composer only goes to the start of the wrapped line; use `Control+Home` before inserting a mention chip.
