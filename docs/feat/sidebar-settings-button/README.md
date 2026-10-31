# Sidebar Settings and PC menu evidence

Captured from source revision `4773b95` with the project's [verify-fabs-bot skill](../../../.claude/skills/verify-fabs-bot/SKILL.md), using isolated run `run-20261031023107`. This follow-up adds evidence only; application code is unchanged.

## Walkthroughs

These GIFs step through actual captured UI states, with a caption identifying each action. They are screenshot sequences, not continuous recordings.

- [Settings walkthrough](settings-walkthrough.gif): sidebar → Settings → Plugins → Providers → This PC → sidebar. Each dialog was closed with Escape, and focus returned to Settings.
- [Desktop PC walkthrough](desktop-pc-walkthrough.gif): PC menu → Change icon → Laptop for This PC → paired Studio → Server for Studio → switch to This PC → switch back to Studio.

## Screenshots

Every PNG has a matching full-page `.aria.txt` snapshot with the same basename.

| State | Evidence |
| --- | --- |
| Browser sidebar and PC menu | [Sidebar](browser-sidebar-top.png), [PC menu](browser-pc-menu.png) |
| Settings and all three destinations | [Menu](settings-menu.png), [Plugins](settings-plugins.png), [Providers](settings-providers.png), [This PC](settings-this-pc.png) |
| Phone at 430 × 932 | [Sidebar](phone-sidebar-top.png), [Settings](phone-settings-menu.png) |
| Desktop fresh start and PC menu | [First run](desktop-first-run.png), [Menu](desktop-pc-menu.png) |
| This PC icon change | [Picker](desktop-change-icon.png), [Laptop selected](desktop-laptop-icon.png) |
| Manage PCs and paired PC | [Launcher](desktop-manage-pcs.png), [Two PCs](desktop-two-pcs.png) |
| Studio icon change | [Picker](desktop-server-picker.png), [Server selected](desktop-server-icon.png) |
| Switch to This PC and back | [Before](desktop-before-switch.png), [This PC](desktop-switched-local.png), [Return menu](desktop-switch-back-menu.png), [Studio](desktop-switched-studio.png) |
| Restart remembers the PC and icon | [Restart](desktop-restart.png) |

The browser was driven at a CSS viewport of 1440 × 900; T3 saved those screenshots at 1280 × 800. Desktop screenshots are 1024 × 741, with a 520 × 653 launcher. Phone screenshots are 430 × 932.

## Verification

- `control-fabs launch --tailnet --tailscale-shim`, `doctor`, and `seed` established an isolated database, bot desks, and port 4870. No real bot turns were needed for these menus.
- Browser navigation used T3 preview; Electron navigation used the skill's `control-fabs browser` driver on its virtual compositor.
- Plugins, Providers, and This PC all opened through Settings. Escape restored focus to the Settings button after each dialog.
- The phone title, PC menu, Settings, and New bot fit on the same row.
- The browser PC menu showed only the current PC. The desktop menu showed both This PC and paired Studio, the selected PC, Change icon, and Manage PCs.
- Manage PCs opened the real launcher. Studio was added using a fresh one-time pairing link, through its form.
- The desktop app stayed running while switching Studio → This PC → Studio. This PC kept its Laptop icon and Studio kept its Server icon.
- A second read from the isolated `desktop/pcs.json` confirmed `localIcon: "laptop"` and Studio's `icon: "server"`. After stopping and restarting Electron, Studio reopened signed in with its Server icon.
- PC windows exposed `[typeof fabsDesktop, typeof fabsPcs] = ["undefined", "object"]`; the launcher exposed `["object", "undefined"]`. `fabsPcs.list()` returned ids, names, icons, and current flags without addresses.
- Final `doctor` passed with a fresh web build, the isolated work root confirmed, and Electron responding. `privacy-check` passed for both the run artifacts and this published directory. PNGs were visually inspected; GIFs reuse those masked images.

Hostnames, addresses, QR codes, and pairing details are masked or redacted. Studio is a fixture name. The saved PC connects to this isolated instance over this machine's tailnet address; it does not prove reachability from a second physical machine. Tailscale HTTPS was simulated and left off.

This evidence pass covers the changed menus and desktop switching. Earlier text evidence in [docs/sidebar-settings-button](../../sidebar-settings-button/checks.txt) records the other checks, including unreachable PCs and forgetting PCs; those paths were not rerun here.
