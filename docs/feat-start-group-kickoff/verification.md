# start_group kickoff: verification log
Isolated instance on its own port and data dir, every Claude bot on claude-haiku-5-5. Bots: Chief, Design, Careful.

## 1. Approved: Chief's 1:1 asks for a group with Design and Careful
### Chief's 1:1 after the run
#1 Chief (done): "Hey, I'm Chief. What's the main thing you want me on?" [question "What should I own for you?" options=4 answered=-1]
#2 user (done): "Use the start_group tool to start a group with Design and Careful called Launch plan. In the kickoff, give @Design a one-line coffee shop tagline to write and @"
#3 Chief (done): [tool fabsbot · start_group done] [tool fabsbot · start_group done] [approval start_group allow id=dad0765f-1fd1-4f5c-a216-aee556fbb5a7] "The Launch plan group is open with you, Design and Careful. The kickoff asks <@f91d80d7-0a70-49cf-a28c-88752922d953> for a one-line coffee shop tagline and <@68"

### Primary browser after Allow (it was on Chief's 1:1)
"Thread with Launch plan 50122730-e371-44da-bb89-74069935d435"

### New group: kickoff first, then each teammate's reply
#1 Chief (done): "Welcome to Launch plan. Chief coordinates.\n\n<@f91d80d7-0a70-49cf-a28c-88752922d953>: write a one-line coffee shop tagline.\n<@68b41b8d-f0b7-4fcd-b952-936533f302a"
#2 Design (done): "**Design:** \"Slow down. The good stuff is brewing.\""
#3 Careful (done): "**Launch risk:** No tested rollback plan, so a bad release could stay live longer than anyone can fix it."

### Second browser parked on Design's 1:1 the whole run (see second-client.log)
2026-11-03T03:29:50.411Z open=Thread with Design | group rows=(none)
2026-11-03T03:30:13.484Z open=Thread with Design | group rows=Thread: Launch plan
2026-11-03T03:31:02.617Z open=Thread with Design | group rows=Thread: Stop test, Thread: Launch plan
2026-11-03T03:32:18.831Z open=Thread with Design | group rows=Thread: Lighthouse, Thread: Stop test, Thread: Launch plan

## 2. Denied
### Groups before
[('Launch plan', 'group'), ('', 'direct'), ('', 'direct'), ('', 'direct'), ('', 'direct'), ('', 'direct')]
### Chief's reply
#4 user (done): "Use the start_group tool to start a group with Design called Pricing review. In the kickoff, ask @Design for one price idea."
#5 Chief (done): [tool fabsbot · start_group done] [approval start_group deny id=347e3124-91cf-46fc-b7bb-dc2aed5719dd] "The \"Pricing review\" group wasn't started: you declined the approval prompt, so nothing changed. I haven't asked <@f91d80d7-0a70-49cf-a28c-88752922d953> for a p"
### Groups after
[('', 'direct'), ('Launch plan', 'group'), ('', 'direct'), ('', 'direct'), ('', 'direct'), ('', 'direct')]
### Primary browser after Deny
"Thread with Chief"

## 3. Stop pressed in the new group while both teammates were answering
### Before Stop
#1 Chief (done): "Welcome to Lighthouse. Chief coordinates.\n\n<@f91d80d7-0a70-49cf-a28c-88752922d953>: write a 400-word short story about a lighthouse.\n<@68b41b8d-f0b7-4fcd-b952-9"
#2 Design (streaming): 
#3 Careful (streaming): 
### Right after Stop
#1 Chief (done): "Welcome to Lighthouse. Chief coordinates.\n\n<@f91d80d7-0a70-49cf-a28c-88752922d953>: write a 400-word short story about a lighthouse.\n<@68b41b8d-f0b7-4fcd-b952-9"
#2 Design (error): "Stopped."
#3 Careful (error): "Stopped."
### 20 s later: no new turns
#1 Chief (done): "Welcome to Lighthouse. Chief coordinates.\n\n<@f91d80d7-0a70-49cf-a28c-88752922d953>: write a 400-word short story about a lighthouse.\n<@68b41b8d-f0b7-4fcd-b952-9"
#2 Design (error): "Stopped."
#3 Careful (error): "Stopped."

## 4. Reload
After browser open / both groups reopen with kickoff and replies: group-after-reload.aria.txt, stopped-group-after-reload.aria.txt.

## Unit test
 40 pass
 0 fail
 86 expect() calls
Ran 40 tests across 10 files. [7.46s]
