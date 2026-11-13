# Alpha 10 verification

Verified on 2026-11-13 with `.claude/skills/verify-fabs-bot/SKILL.md` using an isolated server, scratch database, and Electron profile.

- The actual Electron desktop opened the starter conversation (`01-desktop.png` and its ARIA snapshot).
- Navigating Settings → This PC displayed `v0.1.0-alpha.10` (`02-this-pc.png` and its ARIA snapshot).
- The independent `/api/host` response and server startup log reported `0.1.0-alpha.10` (`version.json` and `startup.txt`).
- Doctor confirmed the isolated work root, fresh web build, and running desktop (`doctor.txt`).
- Privacy checks passed, and both screenshots were visually inspected before copying here (`privacy-check.txt`).
- Cleanup stopped the isolated desktop and server and preserved the evidence.

The package version is the only runtime change. The root MIT license and package metadata cover Fabs Bot's code; third-party code and assets retain their existing terms. No dependencies, schemas, or application logic changed. This verification did not exercise real bot turns, remote pairing, or packaged installers.
