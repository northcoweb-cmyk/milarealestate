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

## Batch 3 (screens 11-15): approvals and phone/texting
11. **Approval card ("Sales email, Michelle Turner"):** tags `sales email`, `PENDING`, `Low risk · customer-facing`, `~5 credits`. Body is a generic cold-lead email ("Thanks for getting in touch... whether you're buying, selling, or exploring options") with nothing about the Turners, the showing, or 1227 Main Street. Signed "VERA Real Estate Agent", not the user's name. "Why VERA suggests this: moves the deal forward from contacted." Buttons Approve / Edit / Decline, and **"Approving sends the email (mocked)"**: the send is a mock, not a real send.
12. **Approvals page after approving:** "Nothing needs you / You're all caught up", a list of what VERA always asks about (outside messages, public content, money, deleting, access, recurring automations), and "Already decided: Sales email, Michelle Turner, Done". Actions left went 20 to 19 (1 of 20): **one approved email costs one of the 20 trial actions.** URL is app.meetmyvera.com.
13. **Settings > Phone & texting:** tabs Business, Estimates, Add-ons, Phone & texting, Integrations, Team, Companies, Billing, Language, Voice, App, Account ("Estimates" and "Companies" show it is built for trades). Business number "Not set up", usage "Vera minutes 0/30, Texts 0/50". A 6-step checklist: get a number, choose who picks up, hear VERA answer, register business for texting, carrier approval, send first text. Area code box prefilled "713" (Houston) for a Maryland user.
14. **Texting setup:** four cards (Texting number, Text receptionist, Automatic texts "15 send on their own, 7 ask you first", What VERA may send "9 of 9 kinds allowed").
15. **After picking a number:** a real number (301) 781-6969 that rings the owner's phone; calls "Working", texting "Not registered": **US carriers block texts until the business registers (carrier approval).** Next step "Register your business for texting", then carrier approval, then first text.

### What this tells us
- VERA's real differentiator is a **business phone number with an AI receptionist and texting**. Mila doesn't have that and decided to stay with manual tap-to-send. Their texting needs carrier registration (A2P), the same weeks-long step I flagged, so even they can't text yet.
- Their drafts are generic and not tied to the conversation (the email didn't mention the showing, the Turners, or the address). Mila's drafts use the saved facts. This is a clear quality win to show in the comparison video.
- Their approval is "mocked" in this trial build: be careful about comparing "sends" claims.
- Their trial cost model counts approved actions (20). Mila doesn't cap actions, only credits and AI budget. Worth considering a visible "credits left" chip on Mila's home (VERA shows "19 actions left" at all times).
- Their phone setup is 6 steps. If Mila ever adds a number, make it one tap (pick area code, done) and hide carrier registration behind it.

## Batch 4 (screens 16-20): follow-through, inbox, pipeline
16. **"im confused what do I need to do?"** VERA lists what is built vs not: follow-up workflow built (waiting in approvals), text to the Turners "not yet created", email "not yet drafted, I need property details", Michelle "not yet added as a lead", Instagram post "not yet made, tell me which property". "Just say go on any of these." So after the user asked for 5 things, VERA admits 4 of 5 are undone, and the user had already given the details (address, number, family). Plain dash bullets again.
17. **Inbox:** tabs Messages, Leads & email, Alerts, Calls, Recordings; filters Customers, Team, Unread, Needs reply, Automated; "No conversations here yet". Clean layout, but empty until a number is registered for texting.
18. **After "go":** it prepared 1 item (the follow-up), shown as EXECUTED with a cut-off preview. Generic text ("Whether you're just starting to explore or you've already got a wishlist in mind"). Then "add michelle as a lead already comeon" gets "What's the lead's name?" even though Michelle was named in the same chat.
19. **Pipeline > Leads:** the lead saved is named **"i already told you..."** (the user's frustrated reply was taken as the name), source "manual", contact "No contact info", next step "Send an intro email to open the...", priority 40. A plainly visible bug: it saved the user's complaint as a lead name.
20. **The same chat:** the user typed "i already told you...", VERA answered "Your lead is built and opening now. Review it before anything is sent." with a card prefilled Name/Source and "Open the builder". So it builds a form to finish rather than just doing it.

### What this tells us
- VERA loses context inside one conversation (re-asks names the user already gave), saves junk as data without checking, and ends most flows with "Open the builder" so the user does the work.
- Their best structural ideas: an Inbox that unifies texts, calls, leads & email; a Pipeline (Customers, Leads, Deals) with a priority score and a suggested next step on every row; an Alerts tab.
- Mila's matching surface: Contacts with pipeline stages and a priority list. Missing: a unified Inbox, and a "next step" shown on every contact row.
- For us: validate names before saving (never save "i already told you" as a person), and always carry names forward in a conversation. We pass tests for the second one; add a test for the first.
