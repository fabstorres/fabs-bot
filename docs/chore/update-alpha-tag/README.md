# Alpha 11 verification

The version advances from `0.1.0-alpha.10` to `0.1.0-alpha.11`. This standalone bump follows the existing alpha sequence. The number of pending PRs does not establish a new minor milestone; `0.2.0-alpha.1` can start one when its scope is ready. This PR does not include or depend on unfinished work and does not publish a git tag before merge.

Verified on 2026-11-14 with `.claude/skills/verify-fabs-bot/SKILL.md`, using an isolated loopback server, scratch database, and separate Electron profile:

- The actual Electron app opened the starter conversation (`01-desktop.png` and its ARIA snapshot).
- Clicking Settings → This PC displayed `v0.1.0-alpha.11` (`02-this-pc.png` and its ARIA snapshot).
- The host API returned `0.1.0-alpha.11`, matching the visible badge (`version.json`), and the startup log reported the same version (`startup.txt`).
- Doctor confirmed the isolated work root, fresh web build, running desktop, and browser connection (`doctor.txt`).
- The harness privacy check passed (`privacy-check.txt`). Both screenshots were visually inspected; PC and peer identities are masked. The version snapshot covers the badge only, as required by the skill's pairing/version recipe.
- Cleanup stopped the isolated desktop and server and preserved the evidence.

The only runtime change is the version in `package.json`. Its consumers include the startup log, host API and Settings badge, MCP server/client metadata, outgoing webhook User-Agent, and packaged app metadata. Dependencies, schemas, and application logic are unchanged; the lockfile does not store the root version.

Verification used the existing dependency installation through an ignored `node_modules` symlink. The skill built the web and desktop bundles to run the actual app. Agent turns, remote pairing, outgoing webhooks, and packaged installers were not exercised for this metadata change.
