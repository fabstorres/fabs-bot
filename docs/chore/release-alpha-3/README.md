# Alpha 3 release verification

PR #35 established `0.1.0-alpha.1` and the alpha prerelease sequence. PR #58 advanced it to `0.1.0-alpha.2`; its merge commit `586bc3e` is the remote annotated tag `v0.1.0-alpha.2` and the commit recorded in the installed AppImage. No later version bump or release tag exists. The next release is `0.1.0-alpha.3`, incorporating the subsequent desktop, PATH, Settings, and theme changes, including PR #63.

Verified with the repository's `verify-fabs-bot` skill on an isolated instance and the real Electron desktop app:

- Settings → This PC displays `v0.1.0-alpha.3`.
- `/api/host` and the server startup report `0.1.0-alpha.3`.
- The Settings dialog opens normally; the desktop PC bridge is available and the menu bar remains hidden.
- Doctor and privacy checks passed. Screenshot inspected; the PC identity is masked and the peer name is additionally redacted in the ARIA snapshot.

The only runtime change is the package version. No dependencies, schemas, or app behavior change.
