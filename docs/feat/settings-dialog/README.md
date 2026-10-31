# Settings dialog

Verified with `.claude/skills/verify-fabs-bot/scripts/control-fabs` on an isolated loopback instance, with its own database and work root. The user's running app and data were untouched.

- Desktop (1440×900): the gear opens a shadcn Dialog on Providers, with the chat visible behind the overlay. Providers, Plugins, This PC, Appearance, search, and the no-results state work.
- The chat and composer remain the same DOM nodes; the unsent draft survives section changes and closing. Opening and switching sections leave browser history unchanged.
- Close, Escape, and clicking the overlay dismiss the dialog and restore focus to the gear. Keyboard focus remains inside the open dialog.
- Phone (430×932): opens the section list; Providers opens inside the dialog, Back returns to the list and focuses Providers, and Close returns to the bot list.
- Checked 768px and 320×568 layouts: dialog stays within the viewport with no horizontal overflow. Section content scrolls inside it.
- Appearance changes the whole app to dark immediately; closing returns to the dark chat with its draft intact.

Each PNG has an ARIA snapshot from the same state. Screenshots were visually inspected and `control-fabs privacy-check` passed.
