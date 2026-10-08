# VERA teardown (from the owner's own account screenshots, Oct 8)
Working notes. Batches are added as screenshots arrive; the summary comes when the owner says done.

## Batch 1 (screens 1-5): onboarding and trial
1. **Start:** dark chat, "Getting started, 0% complete", "Finish later". "The fastest way to set up is to scan your website." Buttons: Yes, scan my website / No, ask me instead.
2. **Business name:** typed "poop" and VERA accepted it, then asked the same question again (a loop). Industry chips are generic: ecommerce, contractor/trades, local service, startup, SaaS, creator, agency, restaurant, something else. **No real estate option.**
3. **Real estate typed by hand:** it asks buy/sell/rentals, then "who are your customers", then "what would make VERA most valuable". Progress bar jumps to 49%. It is a generic small-business onboarding, not an agent tool.
4. **"Connecting your tools" (95%):** Meta Ads, Google Ads, Mailchimp, Stripe, Instagram, Google Analytics, each with a Connect button. All marketing and ecommerce tools. **No calendar, no email inbox, no MLS, no CRM.** One description is cut off ("suggest m...").
5. **Trial:** "Take 7 days, or 14 with a card." Trial includes 1,000 AI credits and up to 20 approved actions; it ends at 7 days, 1,000 credits or 20 actions, whichever first. After the 14-day trial: **$149/month** billed automatically. No refunds on payments taken. Moves to a Free plan when the 7-day trial ends.

### What this tells us
- VERA is a generic marketing assistant for any small business. Mila is built for agents: calendar, showings, contacts, listings, posts.
- Their trial caps at 20 approved actions, which a real agent burns in one day. Ours is 7 days of real use.
- Price: $149/month vs Mila $29 / $49.
- Onboarding gaps to beat: accepts junk input, repeats questions, no real-estate path, 6+ screens before value. Mila's first run should reach a working result in one message.
- To copy responsibly: the "Finish later" escape and the visible progress bar are nice. A card-for-longer-trial trick is worth considering later, not for launch.

## Batch 2 (screens 6-10): the app and a real showing request
6. **Home (Simple mode):** left nav Home, Ask VERA, Approvals, Inbox, Work, Help, Switch to Advanced. "What do you need?" box with 3 suggestion chips ("Summarize my business performance", "What should I focus on this week", "Draft this week's content plan"). Top bar shows "20 actions left, 0 of 20" and a Simple/Advanced toggle. A "Get VERA working 1 of 9" checklist and a trial banner push "add a payment method" right away. A "Use VERA like an app / Install VERA" popup covers part of the screen. Welcome card talks about "price a job, send the estimate, invoice when the work is done": a trades business script, not real estate.
7. **Ask VERA:** the chat title is "Tell VERA what to do for poop" and "What can VERA do for poop?" The junk business name is used everywhere and was never validated.
8. **Same request as ours** ("I've got a listing at 1227 main street gaithersburg tmr with the turner family how do I get setup"): VERA asks a clarifying question first ("confirmation/reminder message, or prepping a listing proposal?"). After a second prompt it gives a long generic checklist (Before / During / After) with plain dash bullets. No calendar event was created, nothing saved.
9. **Raw tags leak into the answer:** the reply ends with `</reply>` and `</invoke>` visible to the user. That is a visible bug. It then offers a menu of things it *can* do (send a confirmation, draft a proposal, set up a follow-up, add a lead) and asks which to start with. It only offers; it didn't do any of them.
10. **When asked to do 5 things at once** (text, email, follow-up workflow, lead, Instagram post) it asks "Who's the follow-up for?", then after "Michelle Turner" (typo'd from the family name) builds only one thing: a follow-up with "Who it's for" and "sms draft" prefilled, and "Open the builder". The email, lead and Instagram post were dropped silently. A user must still open a builder to finish.

### What this tells us
- Even VERA doesn't do the one-sentence job. It asks questions, gives generic advice, and does 1 of 5 requested things. Our flow (calendar event added, post drafted, text drafted from one message) is already ahead on that exact request.
- VERA's weak spots are real: junk input accepted, "poop" used as the business name everywhere, raw `</invoke>` tags visible, dropped requests, trades-oriented welcome copy, a 20-action trial cap, payment prompts on every screen.
- VERA's UI strengths to learn from: a clear Simple/Advanced toggle, a visible "actions left" counter, a "Get working 1 of 9" checklist, an Approvals tab and an Inbox. Mila has approvals, but doesn't show a counter of remaining credits on the main screen or a first-week checklist beyond Home.
- Our own gap, found by comparing: when we do multi-part requests, we must never silently drop a part. Mila should list what she did and what she couldn't.
