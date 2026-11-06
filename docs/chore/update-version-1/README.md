# Alpha 8 verification

Verified on 2026-11-05 using `.claude/skills/verify-fabs-bot/SKILL.md` and its desktop, Settings, and pairing/version recipes.

- The isolated harness built the web and Electron bundles and started a loopback-only server with scratch data on port 4870.
- The actual Electron desktop opened This PC. Clicking Settings → This PC displayed `v0.1.0-alpha.8`.
- `/api/host` and the server startup log reported `0.1.0-alpha.8`.
- The PC bridge was available; the launcher bridge was absent in the PC window.
- Doctor passed with the isolated work root, fresh web build, and live desktop CDP connection.
- Privacy checks passed. Both PNGs were visually inspected; the harness masked PC/tailnet details and peer names were additionally redacted from the Settings snapshot.
- Harness cleanup stopped the isolated desktop and server and preserved the evidence.

Evidence: `01-desktop.png` and its ARIA twin show the starting desktop; `02-this-pc.png` and its ARIA twin show the version after navigating Settings. `checks.txt` records the selected API fields, startup line, desktop bridges, and doctor output. `privacy-check.txt` records the artifact scan.

The only runtime change is the package version. It updates the version exposed by the server and Settings, with no dependency, schema, or application-logic changes. Remote pairing and packaged AppImage behavior were not exercised for this version-only change.
