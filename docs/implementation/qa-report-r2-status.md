# Grok round-2 QA report (Oct 22): status

110 findings (3 Blocker, 20 High, 39 Medium, 48 Low). Several drafts and research answers degraded because the OpenAI account was out of credits during the run; those should improve once it is funded.

## Fixed in this batch (regression tests in `tests/qa-report-r2.test.mts` and the 2,398-scenario runner)
- **Blockers:** long paste of notes was merged into ONE reminder (R2-065/073): now one request per sentence, descriptive sentences are listed as "Noted, not acted on" and never edit a property or book anything, with a done / needs-you checklist. R2-062 and R2-074 fixed earlier in this batch.
- **Questions and lookups:** "What's X's phone, email and budget?" stays one question; counts, next open house / showing, today's tasks, percent-of, chat recap answer from saved data (`handlers/basics.ts`).
- **Booking and reminders:** comma-separated bookings split correctly; "tmrw 3", "abt", "cal Name", "w/o" typos; far-out reminders show the date; emoji before a command is ignored; "add NAME buyer" parses the name.
- **Drafts (fallback when AI is unavailable):** price reduction (percent computed), pricing strategy, home-buying tips and rental options now write real bodies and matching subjects; "Draft a text to X" strips the wrapper; no request echoed back.
- **Advice:** NAR rules, price strategy, stale-listing wording, hottest lead from the people named, confidentiality; payment, P&I and net-sheet parsing.
- **Client summary / contact notes:** rewritten brief (real last-contact only, renter and past-client templates), past-client notes, phone/email/budget list answers.
- **Posts:** anniversary uses household first names and does not duplicate; rewrite verifies and shows the post; Just Listed duplicate warns about stage; portal hint reworded to "use your own photos, or ones you have permission to use".
- **Safety:** prompt-injection requests are refused at no charge.

## Intentionally not changed
- "Grok Bot" signature: that is the test account's profile name.
- "No text" flag position: the last agent card slide must stay last.

## Still open (post-launch list)
Credit-ledger label wording for payment-session IDs (R2-069) and date wording (R2-071/108/109); not-found reply on move/cancel (R2-013); "Keep both" on conflicts; "never mind" cancelling a pending question; post-card photo tweaks (R2-029/031/032); "another version" button (R2-093); More-menu wording (R2-084); and low-severity polish. Anything AI-dependent should be re-tested after OpenAI credits are added.
