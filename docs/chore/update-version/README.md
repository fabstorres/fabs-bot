# Alpha 6 release verification

The repository's `verify-fabs-bot` skill launched an isolated server and the real Electron desktop app with separate data and desktop profiles.

- The starter conversation and bot sidebar loaded normally.
- Settings → This PC displayed `v0.1.0-alpha.6`.
- An independent `/api/host` read and the server startup log both reported `0.1.0-alpha.6`.
- The PC bridge was available; the launcher bridge was absent from the PC window.
- Doctor confirmed the isolated work root, fresh web build, and running desktop app.
- Privacy checks passed, and both screenshots were visually inspected before copying here.
- The verification instance was cleaned up; evidence was preserved.

Only the package version changes at runtime. CI handles type checking and the existing test suite.
