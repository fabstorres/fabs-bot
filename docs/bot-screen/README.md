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
