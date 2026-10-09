# The 50 flagged reports (Oct 9): what's fixed, what needs detail

Status key: **Fixed** (pushed to main, tested) · **Partly** (the logic is done, the design pass is not) · **Needs detail** (a decision or example from Ryan makes it right) · **Planned** (clear, not built yet).

## Fixed
| What was reported | What changed |
|---|---|
| Source names and links shown (a site name, a long link) | Never shown anywhere: stripped from every reply, removed from the market card and the property page, and the AI is told never to cite. "Mila's own knowledge" only if truly needed. |
| "Says I'm out of credits when I'm not" | Test accounts now refill credits, skip the trial clock, and get a roomy AI allowance and the top lookup limits. Real customers keep every limit. |
| "Add test credits" wording | Now "Add credits". Ledger line "Credit top-up". |
| Thursday said on a Thursday afternoon = "already passed" | A weekday named on that weekday after the time means next week. "Today" still says passed. Lunch with Mark now gets booked. |
| "Give me a script…" texted a person called "Give" | Verbs are never names. A script request asks phone call, meeting, text or email first, then writes it. "What do I say?" asks too. |
| Follow-ups listed someone just added (Tom) | Only people really due this week. Each has Open contact and Draft follow-up buttons. The contact page has a "Needs to happen / Already happened" card. |
| Cancel gave one line | Shows what will be canceled, Confirm button, and offers to email or text the client to reschedule. |
| Texts read like typed prompts ("Hi Priya, I'm running 10 minutes late") | Warm, natural texts. Email drafts are told to sound like a friendly person, short and easy to answer. |
| Posts: "no images", "same style", "codey", wrong size, "open house" label on everything | Chat posts now use the same drawn designs as the Content tab (rotating palettes and layouts, real image sizes, 9:16 for stories), tap to see full screen, and an "Edit & change style" button. |
| "5 tips" gave no tips | A real numbered list: cover, one image per tip, closing. |
| Sold post was an open house | Two slides: big SOLD with the address and price, then thank you. |
| 3 posts came as 3 separate answers | One answer with a swipeable set, each option with a different angle and look. |
| Random property photos on posts that are not about a property | Never borrowed. A post only uses its own home's photos (read from its listing link when there is one). |
| A capitol and a ballpark saved as homes | When the map says an address is a public or commercial place, Mila asks home, commercial or land before saving or booking. |
| Residential vs commercial vs land | Told apart everywhere: what Mila asks for, what shows on the card, the wording of posts. |
| Rentals: wall of text, sources, no cards | Up to 5 swipeable rental cards, then "who are these for?", saved to the client's profile (not Properties). A client with a pet sees each pet policy. |
| New buyer with a rental wish was treated as a search | Saved as a client. |
| "Add a retail space / office / the Alamo at …", couples, "Email him…", "the Tillery house has 4 bedrooms" | All understood. |
| Paid lookups when out of credits | Locked: no data lookup runs without enough credits. |

## Partly
- **Open house for a non-home**: asks for the kind, then uses zoning and lease terms. The invite and post copy for commercial still use home wording in places.
- **Properties tab only shows homes you have work at**: saved rentals are out of it now. Saved sale listings from a search still go to Properties. Needs your call below.
- **Listing brief should be pre-filled**: she looks up beds, baths, size and price when you add a listing. "What am I missing" does not yet fill them in by itself first.

## Needs detail (the answer decides the design)
1. **Landmark confirm for showings**: should "is this a home?" ask every time for a map landmark, or only the first time per address? (Built as: every time until you answer.)
2. **Saved searches per client**: should they be a section on the contact ("Properties for Dana") you can sort into groups (Top picks, Maybe, Toured)? Which groups?
3. **Listing agreement PDF**: Mila can fill a worksheet (property, seller, price, dates, who signs) and give a PDF. She should not write legal terms. Is a prefilled worksheet right, or do you want a template from your broker?
4. **Out of office**: move the day's items to the next free day automatically, or ask first? (Today she asks.)
5. **Couples and families**: connect matching contacts in the same price and area when a seller is added. Who counts as a match (same area only, or price band too)?

## Planned (next batch)
- Quick questions after adding a client, as one small card with bullets and one box to answer all at once.
- Week view as day cards with who each item is for.
- Email and text options as two clean cards you tap to open.
- "Mila already did this, here is what's left" after a prep, with the finished parts shown as done.
- Pet-friendly check against a client's saved rentals and homes.
- Top-up all test credits button in Mila OS before launch.

## Pricing check (from the 50-question run)
- Ryan's spend for the whole run was about $0.60, so about $0.012 a question on average. Most turns are rule-based and cost nothing in AI.
- A trial user has 100 credits and about $0.50 of AI, which is roughly 40 smart answers. The $20 pool covers 25 trial users at that cap.
- On a paid plan, $8 of AI for 700 credits is about $0.011 a credit allowed, and the run looks closer to $0.006 a credit used. So plans keep a healthy margin. Re-check with real usage after launch week.
