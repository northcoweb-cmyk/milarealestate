# Evaluation failure inventory

Every failure the realistic evaluation found, what broke, the root cause, and whether it is fixed. All results are from the **mocked, deterministic, rule-based** harness (see `eval-spec.md`); none were observed with a live model.

Status: FIXED = fixed in `src/lib/agent` with a scenario that now passes. OPEN = not fixed (reason given). ORACLE = my test expectation was wrong; the agent was right.

## First-run numbers (before the fix for each batch)

| Set | First run | After fixes |
|---|---|---|
| Held-out batch 1 (37) | 21/37 on the very first run; 24/37 after correcting six oracle mistakes of mine, still before any agent change | 37/37 |
| Held-out batch 2 (22), written after batch 1 was fixed | 19/22 | 22/22 |
| Held-out batch 3 (14), written after batch 2 was fixed | 6/14 | 14/14 |
| Held-out total (73) | 49/73 = 67.1% | 73/73 |
| Tuned (87 + 2 not_implemented) | 49/69 when first run (the original 69) | 87/87 |

The drop on batch 3 (43%) is the honest generalisation signal: fixing the failures of one batch did not make the next batch's different phrasings pass. The speech generators in the QA harness (`speech_when`, `resched`, `cancel_ask`, `ambig_event`, ...) found a further 91 failures on seed 0 in 530 new conversations, now fixed (EV-60..EV-67).

## Defects in the agent

| ID | Scenario | What broke | Root cause | Status |
|---|---|---|---|---|
| EV-01 | golden-23 | "I'm out Mon-Wed" then the one-tap "Push all 3 to the first day back" moved three events with no preview and no approval | `shiftEvents` called `update_calendar_event` with `requested: true`, which bypasses the approval gate | FIXED. New tool `shift_calendar_events`: exact preview (every event, old and new time), one approval binding every event's version, refuses overlaps, typed yes works. The old test `remaining-items "out of office: one tap pushes..."` asserted the one-tap behaviour; it now asserts nothing moves on the first tap and everything moves after Confirm (the old expectation was the defect, not the contract). |
| EV-02 | golden-22 | "write Dana a follow-up after Thursday's 3pm showing. draft only, don't send it and don't put anything on my calendar" created a showing | the "showing + time" calendar rule ran before the draft rule; nothing honoured "draft only / don't schedule" | FIXED. Drafting verbs with a message noun route to the draft first; "don't put/add/schedule..." is a refusal, not a booking. |
| EV-03 | golden-22 | the draft for that request was generic ("I wanted to follow up") and ignored "after Thursday's showing" | topic was only read after about/regarding/that | FIXED. Topic now read after "after/following/from", instruction phrases ("draft only", "don't send") stripped, "email Gus the flyer for 12 Oak Lane" keeps the flyer. |
| EV-04 | golden-14 | "just got off the phone w/ Priya Shah. she's pre-approved up to 650k, wants to tour Thursday" asked "What time on Thursday?" (treated as a booking) | `w/` not understood and the event rule ran before the call-report rule; she/he sentences were not credited to the person | FIXED. Call reports route to log-a-call (known client) or save-a-person (unknown); `w/` normalised; pronoun sentences attributed to the person the call was with. |
| EV-05 | golden-6 | "move it to 5" in a brand-new chat moved the event from another chat | with a single event on the calendar `resolveEvent` returned it even though this conversation had no "it" | FIXED. A pronoun with no referent in this conversation asks which event. |
| EV-06 | golden-6 | "Priya Shah is a new buyer, wants a 3 bedroom under $650k" asked "What's their name?" | name parser only knew "named X" / "buyer X" | FIXED. Subject-first ("X is a new buyer"), "my new client is X", "just met / spoke with X". |
| EV-07 | golden-9 | Google Calendar timeout after the local save: reply said "Added" and nothing else | `syncNote` was computed in the tool and dropped by the handler; no retry path | FIXED. Honest "saved in Mila, not on Google Calendar yet" notice plus a **Retry sync** action (`sync_event`) that is idempotent (never pushes an event that already has a Google id). |
| EV-08 | golden-13 | "October thirty fifth", "February 30", "the 45th" silently became today or a nearby day | the date parser ignored an impossible day | FIXED. `invalidDateToken` asks instead of guessing (same pattern as the existing impossible-time check). Spoken "the thirty first" is still parsed as today: OPEN (EV-95). |
| EV-09 | golden-15 | "what does my day look like" with no calendar/email connected gave "Here's your day." and no disclosure | the plan never said what it was built from | FIXED. `coverageNote` (agent lane): lists today's items in text and says plainly when only Mila's own calendar is read and no inbox is connected. |
| EV-10 | golden-21 and 3 variants | "You got that wrong" / "that's wrong" / "WRONG" -> "I'm not sure how to do that yet" | no feedback intent | FIXED. Pure complaints are acknowledged, recorded against the last reply via the existing reply-feedback store, and create nothing. |
| EV-11 | golden-25 | after the agent corrected a home to 4 bed / $479k, `prep` showed "Active listing at $479,000" and "3,100 sq ft" mixed with the feed's status and size, and did not mention that the feed said 5 bed / $899k | the card/lines mixed saved values with feed facts; no disagreement shown | FIXED. The agent's values are never overwritten (already true: refresh fills empty fields only), the feed's own price/status are shown as the feed's, and a disagreement line says what the data says. The status doc's "refresh not overwriting user corrections: NOT DONE" can be updated: the guarantee already held and now has a test; the field-level evidence ledger is still NOT built. |
| EV-12 | golden-3 | "update Priya's budget to 700k" with two Priyas saved the budget onto BOTH | `learnDetailed` attached facts to every contact sharing the first name; no ambiguity check before client updates | FIXED. Ambiguous first names ask which one before prep/notes/updates; facts attach to neither until the agent says which. |
| EV-13 | golden-3c | "email priya about the showing" (lowercase) used whichever Priya was created last | lowercase names were not looked up; the draft handler fell back to the last contact | FIXED. Lowercase first names resolve via the saved-contact lookup; two matches ask. |
| EV-14 | ho-cancel-confirm-no | "wait no, keep it" after a cancel preview did nothing and the approval stayed pending | yes/no matching was prefix-only and did not allow a lead-in word | FIXED. Lead-in tolerant, anchored, short answers only. |
| EV-15 | ho-cancel-typed-yes | typing "yes" after "Ready to cancel X" -> "I'm not sure how to do that yet" | only the replace flow armed a pending approval | FIXED. A single calendar approval preview arms a typed yes/no for exactly that approval. **Hazard found and fixed while doing this:** the first version also accepted "approve everything" as a yes and cancelled a showing (h3-approve-everything). Yes/no are now anchored to short pure confirmations; blanket phrases approve nothing. |
| EV-16 | ho-move-date | "can we do the closing on the 20th instead" not understood | no rule for "do X on <date> instead" | FIXED. |
| EV-17 | ho-multi-three | "Add a showing at ..., remind me to bring keys Friday at 5pm, and email Dana" -> showing silently dropped; WHAT I DID listed 2 items | comma-separated clauses were not split, so the reminder rule swallowed the showing clause | FIXED. Comma + action verb splits; "and add/book/put/send/tell" split. |
| EV-18 | t-multi-two | "Remind me to call Dana tomorrow at 9 and add lunch with Mark Friday at noon" became ONE reminder "Call Dana and add lunch with Mark" at **noon** | "and add" was only split for "add it/this/that/a(n)" | FIXED (same change as EV-17). |
| EV-19 | ho-bulk-paste | "Dev Patel dev@example.com 202-555-0103 looking in Bethesda" and "susan b - susan.b@..." were not imported (flagged "no name") | the line parser needed a separator-delimited name | FIXED. Leading capitalised run is the name, the rest is the note; one-letter initials allowed; lowercase typing is title-cased. |
| EV-20 | ho-posts-three | "make me 3 posts for 12 Oak Lane, 3 bed 2 bath $525,000" ignored the facts the agent typed | the post handler only used saved facts | FIXED. Facts stated in the request are saved on the home (authoritative) and used. |
| EV-21 | ho-call-new-person | "spoke with a guy named Tom Whitaker ... wants to sell" -> "not sure how" | the met/talked rule required "I" | FIXED. |
| EV-22 | t-move-yo | "yo move it to 4" after booking was not understood | the "change the event I just made" shortcut did not know the filler | FIXED. |
| EV-23 | t-cancel-everything | "cancel everything tomorrow" previewed cancelling **all upcoming events** | scope words were ignored; the approval summary named 3 and "N more" | FIXED. Scoped by day / this week / next week; the preview lists every event. |
| EV-24 | t-two-open-houses | "move the open house to 5" with two open houses moved the nearer one without asking | a "soonest within 7 days" heuristic | FIXED. Kind-only references with several candidates ask. A day named for the event ("cancel the showing Thursday", "move Friday's showing") or a clock time ("my 3 o'clock") narrows first. |
| EV-25 | t-interrupt-park-limit | "lunch with Mark on Friday" in answer to "what time is the Oak Lane showing?" replaced the open question; "thanks" was consumed as an answer and produced "I couldn't make that out" | same-intent messages were treated as answers regardless of subject; pleasantries counted as answers | FIXED. Same-intent but different noun/address starts a new request and parks the old question; pleasantries are never answers. |
| EV-26 | t-interrupt-typed-return | "ok the oak lane showing is at 3pm" after an interruption booked a showing **today** instead of finishing Saturday's | only the Continue button could resume a parked question | FIXED. A short plain-words answer about the same thing resumes it (time for a showing, a street address for "which property?"). |
| EV-27 | golden-5 | "remind me to call Dana tomorrow at 9" while Mila waited for a showing time was swallowed as the answer "9" | the bare-number answer shortcut ran for any message with a number | FIXED. Only when the message is not another recognised request. |
| EV-28 | t-recurrence | "open house every Saturday ..." created one event and said nothing about repeating | silent partial | FIXED (disclosure). Events do not repeat; the reply says so and offers to add dates one by one. Recurrence itself: OPEN, product decision. |
| EV-29 | golden-4 | "appointment w/ dentist thurs 8am" -> title "Meeting" | `w/` and lowercase "with X" were dropped from titles | FIXED. Title "Appointment with Dentist"; "lunch w dana" -> "Lunch with Dana"; "book a showing with him" ties to the person just discussed. |
| EV-30 | probe | "when is my lunch?" then "move it to 1" moved the showing created last | `last_event_id` was not updated by questions | FIXED. A question that returns one event makes it "it"; one that lists several clears "it" so Mila asks. |
| EV-31 | probe | "I'm on vacation Oct 20-24" blocked only Oct 20; "out of town next week" asked which days; "off Monday through Wednesday" not recognised | range end without a month, "next week", and `monday` vs `mon` boundary in the intent regex | FIXED. |
| EV-32 | probe | "block off all day Friday, I'm at the NAR conference" -> "not sure how" | no all-day concept | FIXED honestly: a working-day block (8-6) labelled "NAR conference (all day)", and the reply says there is no all-day event type. A true all-day event: OPEN (calendar data model). |
| EV-33 | probe | "remind me to call him" saved "Call him"; "email her the details" right after booking lunch with Dana asked "Who is the email for?" | pronouns not resolved; booking a person did not set the conversation's contact | FIXED. |
| EV-34 | probe | "price is now 450k" / "make it 4 bed 3 bath" -> "not sure how" | no rule for bare facts statements | FIXED (asks which listing when several). |
| EV-35 | h3-remove-3oclock | "Please remove my 3 o'clock with Dana from the calendar" went to the **contact delete** flow ("Deleting always needs your confirmation") and created a contact-delete approval instead of a calendar cancel | `remove` + a name matched delete-data; "3 o'clock" is not in the event-noun list | FIXED. Clock times / "from the calendar" are calendar words; the matching event is found by its time. |
| EV-36 | h3-bare-eleven, h3-dentist-range, h3-two-step | "showing ... Thursday 11" asked for a time; "I'll be at the dentist Friday 10-11" and "lunch with Mark" (no day) were not requests | bare hour after a weekday, first-person "I'll be at X", and event nouns without a date had no rule | FIXED. |
| EV-37 | h3-seller-spring | "thinking of listing in the spring" kept no timeline | timeline parser knew only "next N months" | FIXED (seasons and "in March"). |
| EV-38 | h3-block-range-conflict | "Block off the 20th through the 22nd" not recognised | "block off" not a time-off phrase | FIXED. |
| EV-39 | h3-going-forward | "going forward always cc my assistant" not saved | standing rules needed "I always" | FIXED (explicit standing instruction, scoped to the user). |
| EV-60 | QA `speech_when` | "quarter after four day after tomorrow" -> Oct 11 and "around 2 day after tmrw" -> two days late | the "N days after tomorrow" pattern took the time's number as a count | FIXED (count words need a plural unit). |
| EV-61 | QA `messy_addr` | "310 w diamond ave unit 5" became "Showing with Diamond Ave Unit" | **introduced by my own `w` -> `with` normalisation** acting on the directional "w" | FIXED in the same pass (not after a digit). Caught by the generator before it left the branch. |
| EV-62 | QA `ambig_event` (44 cases) | "move/cancel the showing" with two showings the same day acted on the one created last | `last event + kind` shortcut | FIXED (EV-24 rule; the `move_pick` button now passes the chosen event instead of relying on that shortcut). |
| EV-63 | QA `resched` | "can we do 4pm instead" right after booking not understood | the change-the-last-event shortcut required "it/that/this" | FIXED. |
| EV-64 | QA `content_n` | "create 3 posts for the listing at 12 Oak Lane" saved a **listing** and produced **no posts** | the add-listing rule excluded `post` but not `posts` | FIXED. A silent omission of the whole request. |
| EV-65 | QA `content_n` | "a post for 12 Oak Lane" -> "not sure how" | fragment without a verb | FIXED. |
| EV-66 | h2-dana-called, h2-um-reminder, h2-parked-address | "dana called, wants to see 12 oak lane" saved a note instead of logging a call; "um so like uh remind me ... at nine" kept "Uh call dana at nine"; a typed address did not finish a parked "which property?" | lowercase caller, dictation filler, spoken hour in the title, parked address answers | FIXED. |

## Oracle mistakes (the agent was right)

| ID | Scenario | Mistake | Fix |
|---|---|---|---|
| EV-70 | golden-5 | `ev.map(when)` passed the array index as the zone | wrote `(e) => when(e)` |
| EV-71 | ho-honolulu-latenight | expected the wrong UTC day (Honolulu is UTC-10, Monday 23:30 + "tomorrow" is Tuesday 12:00 HST = Oct 13 22:00Z) | corrected |
| EV-72 | ho-two-priyas-flyer, t-two-open-houses | question detector required a "?" in text; a "Wrong?" undo card counted as a question | `isQuestion` looks at real choice/contacts blocks and ignores undo cards on a completed action |
| EV-73 | golden-23 | the multi-day Out-of-office block tripped the harness's 24-hour sanity check and overlap check | block is exempt from the 24h check; the turn allows overlap (blocking time over existing events is the design) |
| EV-74 | ho-multi-impossible | required "can't/cannot" wording; "I'm not sure how to do that yet" with the item marked not-done is an acceptable statement | accepted, plus the subtask state is checked |
| EV-75 | ho-bulk-paste | required the unclear row "susan b" to import without asking | accepted imported OR offered for confirmation; never silently dropped |
| EV-76 | t-credit-trial-ended | inserted a second subscription row; the user already had one | updates the existing row |
| EV-77 | t-move-sunday | "move it to Sunday" said on a Sunday means today | scenario now runs on a Wednesday |
| EV-78 | golden-19 | demanded the attacker end with zero tasks; a task titled "x" in the attacker's own account is harmless | asserts no task/reminder points at the victim's ids or content |
| EV-79 | golden-16 | 3 concurrent turns by the SAME user race on one conversation; and "13am" is not a time | A and B run in parallel, each sequential; hours fixed |
| EV-80 | QA `date_phrases` seeds 1-4 (pre-existing) | "Sat noon to 2pm" said at 12:29 on a Saturday expected today; the agent's documented rule rolls a same-weekday time that already passed to next week (the `open_house` oracle already accepted it) | oracle accepts +7 days in that case |
| EV-81 | QA `create_event` seed 2 (pre-existing) | "Book a lunch for today at 12" at 12:39 flagged "scheduled in the past" although the lunch is in progress | in-progress events for an explicit "today" are accepted |
| EV-82 | golden-16 / trial pool | the lead's new reservation model supersedes pool-wide cutoff | `t-trial-pool-isolation` asserts the new contract: a user who overspends hits their own limit, another admitted user is not refused, the pool closes **new admissions** |

## Open defects and decisions

| ID | What | Why open | Where |
|---|---|---|---|
| EV-90 | golden-12: a pasted listing link for a **different** building attaches its photos to the property | `pullListingPhotos` does not compare the page's structured address to the property; the fix belongs in `src/lib/images/listing.ts` (non-agent lane). Street View already requires city + state, which is the only protection today. | `src/lib/images/listing.ts` |
| EV-91 | golden-10: two sites repeating one syndicated origin count as agreement | no evidence ledger exists (status doc Stage C: NOT DONE) | new feature |
| EV-92 | Multi-day "Out of office" is one 58-hour event | a single long event can render poorly and trips the QA 24h check (exempted); per-day blocks would be safer | `timeOffHandler` |
| EV-93 | No all-day event type; no recurring events | calendar data model; both are now disclosed in replies instead of silently approximated | `CalendarEvent` |
| EV-94 | `decideApproval` for `send_email` really sends through Gmail/Outlook when connected, while the chat button says "Open in email app" and the Tasks/Review labels say "Approve draft" | wording audit result: no "Approve & send" label remains; the only "sent" strings are true statuses and the user-attested "Yes, sent" prompt. But "Approve draft" can end in a real send when Gmail is connected, which the label does not say | `src/components/review-sheet.tsx`, `src/app/(app)/tasks/page.tsx` (lead's lane) |
| EV-95 | Spoken ordinals ("the thirty first") parse as today | rare; the impossible-day check asks only for impossible values | `parseDate` |
| EV-96 | Same-user parallel turns (double tap) share conversation state, last write wins | not exercised beyond the existing `concurrency` QA category | engine |
| EV-97 | Voice: no audio pipeline here | golden-13 covered as a text proxy only | n/a |

## Wording audit (compose / "sent")

Searched `src/lib/agent`, `src/components`, `src/app` for sent / Approve & send / Send now / Message sent. Result: **no violations remaining.** "Approve & send" is gone from `review-sheet.tsx` and `tasks/page.tsx` (now "Approve draft"). Remaining "sent" strings are true statuses (`status === "sent"` after a real Gmail/Outlook send, "Sent N emails." only on success), the honest "Nothing was sent. Open the email in your email app to send it.", "I don't send texts myself, so nothing goes out until you tap Send.", and the user-attested "Did you send your text to X? / Yes, sent". See EV-94 for the label that can still surprise.
