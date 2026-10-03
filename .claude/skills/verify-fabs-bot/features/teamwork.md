# Teamwork

Bots work together. A bot can message a teammate privately and get the reply back mid-task. The user sees a live link between the two bots on the field and can read the conversation under the Bot ↔ bot tab. In a group thread, @mentions decide who speaks, and bots hand each other the floor.

## Sub-features

- `team-delegate` makes one bot ask another and use the answer in its own reply.
- `team-link` draws an animated link between the two bots on the field while they talk.
- `team-backchannel` lists the private thread `<A> ↔ <B>` under the Bot ↔ bot tab, readable by the user.
- `team-group` has a dock message that @mentions several bots start a group thread where each replies in turn.
- `team-pull-in` adds a bot to an existing thread when it is @mentioned in the composer.

## How to get to it (user POV)

- Ask a bot to consult a teammate ("ask Design for …") in any thread.
- Choose the `Bot ↔ bot` tab in the Inbox to read backchannels.
- Type `@Chief @Design …` in the dock to start a group thread.
- Type `@Design …` in an existing thread's composer, or choose `More` → `Bring in a bot`.

## Driving it with control-fabs

Preconditions:

- Baseline state from the map README. `Chief` and `Design` exist; no `Chief ↔ Design` backchannel yet.
- `claude` is logged in.

- **Delegate.** Run `$C browser fill --label "Hand off work" --value "@Chief use message_bot to ask Design for three short tagline ideas for a coffee shop, then reply with the one you like best."` and `$C browser press --label "Hand off work" --key Enter`, then `$C browser click --role button --name "Back"` right away so the field is visible.
- **Live link.** Immediately run `$C browser wait --selector '[data-link="Chief->Design"]' --state attached --timeout 60`, then `$C browser screenshot --path teamwork/link.png --settle 0`. An animated curve joins Chief and Design while Design answers. Chief's bubble reads `Waiting on Design`.
- **Delegation result.** Get `<T>` from `$C threads` (the `direct` row for Chief). Run `$C wait <T> --for idle`. `$C thread <T>` shows `[tool fabsbot · message_bot done]` and a reply quoting one of Design's taglines.
- **Backchannel.** Run `$C browser click --role tab --name "Bot ↔ bot"` and `$C browser click --role button --name "Thread: Chief ↔ Design"`. The sheet `Thread with Chief ↔ Design` shows Chief's request and Design's answer, each under its author's name. Capture `$C browser snapshot --role region --name "Thread with Chief ↔ Design" --path teamwork/backchannel.aria.txt`.
- **Group thread.** Run `$C browser click --role tab --name "Threads"`, then `$C browser fill --label "Hand off work" --value "@Chief @Design each give me one word that describes Monday."` and `$C browser press --label "Hand off work" --key Enter`. Run `$C browser wait --role region --name "Thread with Chief, Design"`, get `<G>` with the eval from the README, and run `$C wait <G> --for idle --timeout 240`. `$C thread <G>` shows a reply from Chief followed by one from Design.
- **Pull a bot in.** In Chief's direct thread, run `$C browser fill --label "Message" --value "@Design what do you think of that pick?"` and press Enter. The header changes to `Chief, Design` and `$C thread <T>` gains a Design reply.
- **Proof.** Capture `teamwork/link.png`, `teamwork/backchannel.aria.txt` plus `.png`, and `$C thread` dumps for `<T>` and `<G>`.

## Gotchas

- The link exists only while the teammate is answering, usually a few seconds on haiku. Start `browser wait --selector '[data-link=…]'` immediately after sending. If it is missed, the backchannel thread is still the proof of `team-delegate`; report `team-link` as not captured rather than verified.
- Claude Code has its own `SendMessage`/`ListAgents` tools. Fabs Bot hides them per run. If a bot replies "Design isn't available", that hiding regressed. That's a product bug, not a flaky run.
- Group threads without an @mention run every member in order, each seeing the earlier replies. Allow `--timeout 240`.
- Bot names with spaces are mentioned without spaces (`@ChiefofStaff`). The mention menu inserts that form.
- Backchannel titles use `↔` (U+2194). Copy it exactly in `--name`.
