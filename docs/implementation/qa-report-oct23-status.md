# QA report Oct 23 (Grok launch-day run): status of every item

41 unique bugs (M-01 to M-41). "Retest" means the fix is in and tested here, but it needs a real run with OpenAI and your live data to confirm.

| ID | Sev | What | Status |
|---|---|---|---|
| M-01 | Blocker | Questions executed as property-status writes | Fixed: a question can never become a write through the AI classifier; "status of", "is X still available", "how many active listings" answer read-only |
| M-02 | Blocker | Price-reduction draft changed the saved price | Fixed: the draft shows the new price, the home keeps its real one; warns when the home is under contract |
| M-03 | Blocker | New contact merged into the wrong person | Fixed: a shared phone or email under a different name is a new contact (the "QA TEST" prefix made every test name look alike); re-adding a set-aside contact brings them back and saves the phone |
| M-04 | Blocker | No general-assistant fallback | Fixed in routing: explain, rewrite, translate, scripts, bios, calendars, plans, quizzes and "make it shorter" go to the assistant, never into a listing-post flow. Retest with OpenAI funded |
| M-05 | High | Writing requests hijacked by the Oak Lane post flow | Fixed (same gate); no drafts or properties are created for them |
| M-06 | High | Context and pronouns lost | Fixed for her/him on updates, notes and texts (he'll becomes you'll); stale "Still open" cards expire after 20 minutes and never ride on chat answers |
| M-07 | High | Long notes dropped | Fixed: each sentence is handled; descriptive ones are saved on the person they are about (a new person becomes a lead); actions are done |
| M-08 | High | Reminder and call titles drop the subject | Fixed: shorthand (remnd, tmrw, re, agrmt, appt) understood; calls keep who and what; no junk to-do |
| M-09 | High | Signed "Grok Bot" | "Sign it X" is honoured. The name comes from the account's profile name; "Grok Bot" is the test account's own name. Real agents set theirs at sign-up |
| M-10 | High | Instructions and facts ignored | Fixed: no hashtags, sign-off, count of homes asked for, land and 0-bed shells left out, facts in a listing-description request are used and saved |
| M-11 | High | Wrong city, seller address not saved | Fixed: a seller's address is saved as typed (city, state, ZIP) and noted on them |
| M-12 | High | Relative dates and schedule answers | Fixed: plan tomorrow (with reminders), showings next week, move a whole day, multi-day blocks on every calendar day, what got done includes reminders and events held |
| M-13 | High | Overlap blocks booking | Fixed: "Keep both" books it anyway; real start and end times are used |
| M-14 | High | Math not performed | Fixed: commission on a saved address (accepted price when under contract), cash to close |
| M-15 | High | CMA fails for saved homes | Improved: the saved home's address, size and price go with the request. Retest with OpenAI |
| M-16 | High | Failed answers charged in full | Fixed: research that could not verify the home is capped at 3 credits; a question asked back costs at most 2 |
| M-17 | High | Research costs 24-37 credits | Not changed: that is the real cost of web research. Estimate-before-run is still to do |
| M-18 | High | Chat closes or is lost | Fixed: the page no longer reloads on time-zone sync (that closed the chat and dropped the message); the data layer returns every row (was capped at 1,000) |
| M-19 | High | Pipeline numbers wrong | Fixed: uses the same stages as the Properties page |
| M-20 | Med | Balance rises | Not found: test accounts get automatic top-ups; check the Credits history for the ledger row |
| M-21 | Med | "Out of credits" at 2 | Fixed: the message says what the action needs and what you have |
| M-22 | Med | Ask Mila auto-sends | Fixed: it fills the box and waits for Send |
| M-23 | Med | Who haven't I talked to / focus today | Fixed: ranked by last contact; focus shows today's events, deadlines, approvals, overdue and who to reach |
| M-24 | Med | Wrong topic, stale rules | Fixed in routing: county tax and "2026 NAR rules" questions go to the assistant. Retest |
| M-25 | Med | Budget not in saved search; home search ignores count/type | Fixed |
| M-26 | Med | Generic drafts | Fixed for thank-you and text details (date, you'll). Weekly seller update, feedback template and Just Sold depend on OpenAI: retest |
| M-27 | Med | Messy multi-part message | Fixed: a refusal applies to its own part; the rest is done |
| M-28 | Med | Seller wording | Fixed |
| M-29 | Med | No-text preview, 404s | Fixed: the preview redraws on any slide setting; past homes no longer request street images |
| M-30 | Med | Properties search hides listings | Fixed: a search looks through every tab |
| M-31 | Med | Spanish reminders | Fixed (reminders, days, times, call) |
| M-32 | Med | Google status contradicts itself | Reworded and made consistent ("Not on your Google Calendar yet"); the plan note no longer talks about email |
| M-33 | Med | Quiz garbled | Fixed: multiple-choice text is never turned into step cards |
| M-34 | Low | utm links, markdown | Fixed |
| M-35 | Low | No date in confirmations | Fixed: date always, end time for blocks of an hour or more |
| M-36 | Low | Duplicate to-dos and reminders | Fixed |
| M-37 | Low | Stale Still open cards | Fixed |
| M-38 | Low | No broker note | Fixed |
| M-39 | Low | Moved showing vs reminder | Fixed (soft heads-up) |
| M-40 | Low | Recurring reminders | Fixed: every day / weekday / week / month sets the next occurrences |
| M-41 | Low | Zillow/Redfin photo hint | Fixed earlier |

Also shipped this round: 6-digit email code at sign-up (REQUIRE_EMAIL_CODE=off turns it off), one morning and one evening summary email, queue emails, grant-next buttons.
