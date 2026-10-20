# Plan: fix the Oct 19 QA report (223 bugs)

Source: `Mila-QA-Report.docx` (Blocker 4, High 50, Medium 125, Low 44). Goal: every bug is fixed, partly fixed with the reason, or marked "needs owner" with the exact action. Nothing is called fixed without a test.

## How the work is organized (so nothing overlaps and usage stays low)
- Many reported bugs share one root cause, so we fix each root cause once. 11 workstreams, each owning its own files. A bug is listed under one workstream only.
- Order: do the workstreams that unblock others first (W1 names and W2 safe writes), then the ones that reuse them.
- Per workstream: reproduce with one script (`tests/qa/rp.mts`, deleted before commit), fix, add one regression test file, run only that test file. The full gate (tsc, eslint, unit tests, 2,398-scenario QA) runs once at the end of each workstream, then one commit and one push.
- Model use: Sonnet for `src/lib/agent`, credits, billing; Haiku for running gates, committing, docs, and adding tests for decided behavior.
- Do not loosen any existing test. If an old test encodes a superseded decision, change it and say so.
- Reading the report is done (extracted once to `/tmp/qa_docx/bugs.txt`); do not re-read it.

## Needs the owner (code cannot fix)
- BUG-187 / 021 / 074 / 129 / 143 / 168 / 179 and every "I'm not sure how to do that yet" on advice, legal, market and research questions: Mila's OpenAI account ran out of quota (error 429, `insufficient_quota`). Add OpenAI credits and set a spend limit. Rule-based answers (calculators, calendar, contacts) are fixed in code so they do not depend on it.
- BUG-001 (+3,000): the grant came from Mila OS. Fixed in code by showing every grant in usage history.
- BUG-017: Gmail is hidden for launch by decision; the menu copy is fixed.

## Workstreams

### W1. Names and contacts (task #32) — `nlu.ts`, `handlers/contacts.ts`, `engine.ts`
Done: no junk contacts ("Agent", "Credit", "Profile", "The", "Is", "Hi"); household names; bare "Add Tomas Ferreira"; "What's their name?" answered by a bare name; "add her as a seller"; related contacts; possessive and filler stripped; a typed full name never matches a different person with the same first name.
Remaining: 036 emoji in name, 042 apostrophe/hyphen, 060 accents and "Rockville., MD", 146 "MD, MD", 165 couples ("Hollis and Mae"), 207 duplicate-on-"new" prompt, 150 prefixed record lookup, 137/181/123 words taken as names, 196/202 new buyers intro, 188/189/105/029 pronouns ("she/her/he") resolved to the contact just discussed, 037 junk numbers, 148 reasons for rejection, 134 out-of-area phone note, 016 out-of-state licence warning.
Bugs: 002, 006, 007, 009, 023, 034, 036, 037, 042, 060, 082, 096, 100, 103, 105, 120, 122, 123, 126, 134, 137, 140, 146, 148, 150, 161, 164, 165, 181, 188, 189, 196, 200, 201, 202, 207, 219, 221.

### W2. Safe writes (task #32) — `learn.ts`, `handlers/contacts.ts`
Done: facts saved only for the contact the sentence is about; budgets become numbers; commands never saved as facts; roles ("are the sellers") change type; offers recorded cleanly.
Remaining: 104 corrections ("the budget field should say 625k"), 163, 166 asking price to the property, 162/174 memory pollution, 023 net-sheet note, 182, 043 follow-ups only when asked, 108 no search criteria for sellers, 172 seller chips, 092, 084 task title.
Bugs: 002, 023, 043, 084, 092, 104, 108, 122, 162, 163, 166, 172, 174, 182.

### W3. Credits, errors, history (task #33) — `credits.ts`, `ai/*`, `settings/credits`
Balance pre-check, never negative, no charge when upstream fails, friendly error (no provider JSON or billing URL), grants and every charge in a paginated history with real labels, fallback replies free.
Bugs: 001, 003, 004, 005, 021, 032, 033, 169, 175, 187.

### W4. Drafts and messages (task #34) — `handlers/comms.ts`, `llm.ts`, `signature.ts`
Channel from the words (text vs email), content from the facts (no echoed instruction, no "Following up" template), saved notes used, text-only preference respected, recipients who are not contacts, revise the last draft by chat ("rewrite it to say…"), email on file saved from chat, "Open in email app" also offers Gmail and Copy, subject cut at a word, no "Congrats" on bad news, grammar (a/an).
Bugs: 030, 049, 050, 051, 064, 075, 087, 098, 102, 103, 114, 141, 147, 153, 154, 159, 173, 184, 186, 195, 211.

### W5. Calendar and reminders — `handlers/calendar.ts`, `reminders.ts`, `nlu.ts`
Named events (photo shoot, sign install, inspection, financing, appraisal) with their own titles; separate deal deadlines; "sat 1 to 4"; "Monday has passed" when today is Monday; week-of queries and "this week" range; reschedule in one step with names; typed pick of an offered slot; "find another time" on the same day; double-book option; out-of-office shown with its real span, queryable and editable; reminder titles kept (no "Reminder", "Check on it", stray "morning"); list and mark reminders done; dates on confirmation cards; Google sync on move/undo; titles keep QA prefix and client names; filler word in titles.
Bugs: 008, 018, 025, 026, 047, 056, 061, 062, 063, 068, 083, 086, 099, 110, 111, 112, 115, 116, 118, 119, 124, 125, 127, 132, 138, 139, 151, 152, 157, 158, 171, 176, 177, 178, 199, 203, 204, 205, 208, 209, 210, 218, 224.

### W6. Properties and deals — `handlers/listing.ts`, `product-help.ts`, `deals.ts`
Status words (Coming soon, Active, Under contract) saved on the right property; list date; "It's 5 bed 4 bath, $1,475,000" applies to the property just added; beds/baths/sqft saved the first time; no invented property type; address as typed (suffix, prefix); right property for prep/status/post; saved properties used for compare and lookups; offers and accepted offers recorded on the deal; price changes confirmed; out-of-market and rent-priced listings excluded; "Couldn't find online" not shown for saved homes.
Bugs: 012, 013, 015, 038, 039, 040, 041, 044, 045, 046, 065, 085, 106, 107, 113, 121, 166, 180, 185, 193, 197, 212, 213.

### W7. Questions answered from saved data and calculators — `handlers/*`, new `calc.ts`
Mortgage payment, affordability, seller net sheet, net price with a credit, reduction percentage, commission; "which buyers are under $600k", compare budgets, hottest lead, recap ("what did I get done today"), what's on my plate; counts consistent (3 vs 6 items, drafts 58 vs 71); each contact once.
Bugs: 014, 066, 067, 073, 128, 155, 156, 160, 194, 205, 206, 216, 222.

### W8. Routing and context — `intents.ts`, `engine.ts`
Commas no longer split one request; corrections apply to the last thing made; "Still open" cards expire, stay inside their chat and show clean text; "Continue it" finishes; fallback chips match the request; one-line fallbacks are free; no "Congrats" misroutes; notes route to notes, not scheduling; "open house" in a follow-up request does not ask for a sign-in sheet; cross-chat memory for deals.
Bugs: 019, 020, 048, 053, 054, 058, 059, 064, 072, 076, 091, 093, 097, 109, 129, 131, 135, 136, 139, 144, 145, 184, 185, 220, 223.

### W9. Content and posts — `content/*`, `handlers/comms.ts`
Coming Soon posts; anniversary posts; no "Just Listed" for unlisted or past homes; right property; rewrite and edit caption; "make another version" differs; translate; open-house date on post; Zillow/Redfin tip kept for photos only per owner decision (BUG-035 noted as intentional); chips ("Edit & change style", "Add photos").
Bugs: 011, 027, 028, 035, 052, 054, 072, 088, 089, 090, 117, 190, 214, 215.

### W10. Safety and advice — `fair-housing.ts`, `product-help.ts`
Broker-approval ad with "family without kids" refused; refusal costs nothing and runs no search; client-confidentiality advice (son asking for financials); out-of-state licence warning; offer-strategy and appraisal-gap answers as rule-based guidance with "check with your broker" and research when available.
Bugs: 022, 031, 016, 143, 168, 179, 192, 198, 069, 070.

### W11. UI polish — `components/*`, pages
Toast that blocks chat, list refresh after save, Connections test/sync controls, quick-question placeholders, raw HTML in names, sample data never on real calendars (chips "Set up an open house", "Add a new buyer"), draft counts agree, stale greeting.
Bugs: 034, 050, 077, 078, 095, 101, 130, 133, 160, 217, 094.

## Final step
Re-run the credit-burn prompt on the live app, then write the per-bug table (fixed / partly / needs owner) into `docs/implementation/qa-report-oct19-status.md`.

### W12. Added by the owner (Oct 19, after W11)
- **Low-credit and usage UI:** a clean meter on Home/More/Credits showing credits used vs the plan, a "running low" state at 20% left and an "out of credits" state, each with a one-tap "Buy credits" button and what a top-up costs. Usage history already lists every charge and grant (done in W3).
- **Admin auto top-up:** the account that "randomly topped up" is a tester/admin account; test accounts get +3,000 credits whenever they run low (`TESTER_TOPUP_CREDITS`, `src/lib/testers.ts`). Keep it for testers, but show it plainly in the ledger as "Test account top-up" and add a switch in Mila OS to turn it off so a tester can run down to zero like a real user.
- **Annual plan on the waitlist site:** add the $390/year plan (two months free, +500 bonus credits) next to $39/month on the pricing section and the FAQ, in `waitlist/src`.

### W13. Chat-style onboarding with real connectors (owner, Oct 19)
Replace the plain onboarding with a short conversation like the example the owner shared: Mila introduces herself in two bullets, then offers connector cards (logo, name, one-line reason, one dark button, "Mila asks before making changes. Disconnect any time."). Only connectors that actually work today:
- Google Calendar (events Mila adds; add-only), Google Contacts, Google Sheets (contact import): one "Connect Google" flow using the existing `/api/integrations/google/start`.
- Apple Calendar / any calendar app: the private subscription link (one tap), not an OAuth.
- Not shown: Gmail (hidden for launch), Microsoft/Outlook (removed), MLS (not available).
Each card goes straight to the real flow, returns to the same chat, and flips to "Connected". Skip is always available; nothing blocks the first task.
