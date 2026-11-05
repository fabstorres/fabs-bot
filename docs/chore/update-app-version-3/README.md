# Alpha 7 verification

The repository verify-fabs-bot skill launched an isolated server and Electron desktop with scratch data and a free port.

- Settings → This PC displays `v0.1.0-alpha.7` after opening Settings and selecting This PC.
- `/api/host` and server startup both report `0.1.0-alpha.7`.
- The desktop PC bridge is available; the launcher bridge is absent in the PC window.
- Doctor confirms the isolated work root and fresh web build. Privacy checks passed, the screenshot was inspected, and the peer name in the snapshot was additionally redacted.

The runtime change is only the package version. The version displayed by the server and Settings changes; dependencies, schemas, and application logic do not.
