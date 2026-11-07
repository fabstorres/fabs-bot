# Alpha 9 verification

Verified on 2026-11-06 using `.claude/skills/verify-fabs-bot/SKILL.md` and its desktop, Settings, and pairing/version recipes.

- Started from main at `be35b3ac90da5abe7a99fd13a275e747028c025d`.
- The harness built the web and Electron bundles and launched a private loopback-only server on port 4870, with scratch bot data and a separate desktop profile.
- The actual Electron desktop opened This PC. Clicking Settings → This PC displayed `v0.1.0-alpha.9`.
- `GET /api/host` returned HTTP 200 with version `0.1.0-alpha.9` and the isolated work root. The startup log reported `fabs-bot 0.1.0-alpha.9`.
- The PC bridge was available; the launcher bridge was absent in the PC window.
- Doctor passed with a fresh web build, the isolated work root, and a live desktop CDP connection.
- Both screenshots were visually inspected. PC and tailnet details were masked by the harness; peer names were additionally redacted from the Settings ARIA snapshot. Privacy scans passed for the run artifacts and the copied PR artifacts.
- Cleanup stopped the isolated desktop and server, removed scratch data, and preserved all evidence.

`01-desktop.png` and its ARIA twin show the starting desktop. `02-this-pc.png` and its ARIA twin show the version after navigating Settings. `checks.txt` records selected API fields, the startup line, desktop bridges, and doctor output. `privacy-check.txt` records the scan of these PR artifacts.

The only runtime change is `package.json`'s version. Existing consumers include the server startup log, host API, Settings badge, MCP server and provider client metadata, and packaged application metadata. There are no dependency, schema, or application-logic changes. The lockfile does not store the root version and is unchanged, following earlier release bumps.

Existing dependencies were reused through an ignored local `node_modules` symlink; nothing was installed. Remote pairing, agent turns, and packaged AppImage behavior were not exercised for this version-only change. Packaging, installation, and the independent review belong to the parent task.
