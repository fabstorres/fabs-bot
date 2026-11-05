# Screen review evidence

Captured from an isolated loopback instance at commit c06b985. Screenshot masks stayed enabled; both images passed the harness privacy scan and visual inspection.

- [Idle desk tile](review-idle.png)
- [No Chromium tile](review-no-chromium.png)

Chief used `claude-haiku-5-5`, configured before its first turn. That turn hit the provider's five-hour usage limit before running any screen tools. Live screen, hand-over, login persistence, phone touch control and walkthrough GIF evidence could not be captured.

## Sol browsing walkthrough

Captured on isolated loopback port 4894 at 6e21db3. Scout was created using New bot, then saved with Brain Codex and Model `gpt-6.1-sol` before its first turn.

- [Model editor](sol-editor.png): Codex and the exact model setting.
- [Live desk tile](sol-tile.png): YouTube results, Open pill, and blue activity dot.
- [Expanded mid-scroll](sol-expanded.png): search results beside the chat, with active status dot.
- [Expanded completion](sol-finished.png): results after three scrolls and Scout's report.
- [Browsing GIF](sol-bot-browsing.gif): 960px, 10 fps; idle gaps shortened.
- [Browsing MP4](sol-bot-browsing.mp4): real-speed H.264, 1440×900, yuv420p (OpenH264 encoder).

YouTube's signed-out homepage said “Try searching to get started,” so five downward scrolls revealed no feed. Scout scrolled back up, searched “lofi hip hop,” and scrolled the results three times. Results included Lofi Girl, study mixes and an advertisement. No consent, CAPTCHA or login wall appeared; no fallback site was needed. The turn ran 22 screen-tool calls.

Recording masks hid the PC identity and pairing selectors before capture. A cached initial frame was removed. Sampled recording frames and every still were opened for visual privacy inspection, and the harness privacy scan passed.

## Hand-over, regression checks and phone control

Chief used `claude-haiku-5-5`, set before its first turn. The sign-in fixture was served on loopback port 5199. Email was stored in localStorage and shown on the dashboard. No real credentials were used.

| File | What it shows |
| --- | --- |
| [take-over.gif](take-over.gif) | Amber card → Take over → email typing with key overlay → sign in → Hand back → Chief names the signed-in email. 960px, 10 fps, idle gaps shortened. |
| [take-over.mp4](take-over.mp4) | The same walkthrough at real speed, H.264/yuv420p, 1440×900. |
| [card-pending.webp](card-pending.webp) | Pending amber card, live thumbnail and needs-you sidebar state. |
| [control-taken.webp](control-taken.webp) | Expanded view with the You chip and Hand back button. |
| [typing.webp](typing.webp) | Email entered through the screen keyboard field; on-page overlay shows Tab. |
| [signed-in.webp](signed-in.webp) | Dashboard displays fabiola@example.com while the user controls the screen. |
| [hand-back.webp](hand-back.webp) | Settled card and Chief's reply naming the email beside the dashboard. |
| [card-settled.webp](card-settled.webp) | Handed back card, reply and dashboard tile in the desk. |
| [close-refused.webp](close-refused.webp) | Chief's real screen_close call is refused while the chip reads You; dashboard remains visible. |
| [dark.webp](dark.webp) | Dark theme with the expanded live dashboard and chat. |
| [phone-desk.webp](phone-desk.webp) | Live phone desk tile at 430×932. |
| [phone-expanded.webp](phone-expanded.webp) | Phone expanded view with Idle chip and full-width Take control. |
| [phone-touch.webp](phone-touch.webp) | Phone in control after a successful tap and drag. |
| [two-devices.webp](two-devices.webp) | Rejected second viewer incorrectly claims You while another viewer owns control. |
| [take-over-expanded.webp](take-over-expanded.webp) | Clicking the card's Take over while already expanded leaves Idle and Take control unchanged. |

Verified through the project verification harness and real agent turns:

- Device deletion: paired a throwaway device internally, opened both event and screen sockets, removed the device, and observed both close with code 1008, reason “device removed.” Its next authenticated API request returned 401. No tailnet listener was enabled.
- Bot close refusal: took control in the UI, asked Chief to call screen_close, and observed the rejected tool result. Hand-back restored bot access.
- Hand-over: clicked Take over from the card, clicked the canvas email field, typed through “Type on Chief's screen,” submitted with keyboard keys, and handed back. Chief read fabiola@example.com from the dashboard. An initial attempt clicked above the input; the committed walkthrough shows the successful repeat.
- Persistence: Chief closed and reopened its browser, then read the same email from localStorage.
- Phone touch: a separate Playwright context used 430×932, hasTouch and isMobile. A touchscreen tap activated the fixture button. A CDP touch drag scrolled the actual page; fixture event read-back recorded increasing scrollY and an empty selection throughout.
- Reviewed the full PR diff and checked all nine original commit subjects against their changes. Subjects match their commits. Findings were posted as PR comments; no code was changed.

Two P2 findings remain: a rejected second viewer incorrectly claims control and can hand back the actual owner's session; a card's Take over does nothing when its screen is already expanded. Both were reproduced through the UI.

Limitations: after the first close/reopen persistence turn, the browser unexpectedly became closed despite successful tool results. Reopening restored it. The cause was not isolated, so this is an observation rather than a confirmed finding. Physical phone hardware and real third-party sign-ins were not tested. Screenshots use WEBP or PNG; raw recordings were privacy-masked before capture. Every committed still and sampled encoded frames were visually inspected; the harness privacy scan passed.

## Earlier evidence and design references

The initial review images above predate this walkthrough. Files under `mockups/` are design references, not runtime proof:

- [01-desk-screen-live-light.webp](mockups/01-desk-screen-live-light.webp): light desk concept.
- [02-desk-screen-live-dark.webp](mockups/02-desk-screen-live-dark.webp): dark desk concept.
- [03-screen-expanded-watching.webp](mockups/03-screen-expanded-watching.webp): expanded watching concept.
- [04-screen-you-have-control.webp](mockups/04-screen-you-have-control.webp): control state concept.
- [05-chat-screen-needs-you-card.webp](mockups/05-chat-screen-needs-you-card.webp): hand-over card concept.
- [06-screen-tile-states.webp](mockups/06-screen-tile-states.webp): tile state concepts.
- [07-phone-screen.webp](mockups/07-phone-screen.webp): phone concept.

Cleanup completed: the isolated server/browser and fixture servers were stopped, and the scratch data directory was removed. Harness confirmation: `evidence kept: .verify/artifacts/run-20261105045400 (44 entries)`.
