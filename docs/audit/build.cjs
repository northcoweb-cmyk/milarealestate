const fs = require("fs");
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, LevelFormat, BorderStyle, PageBreak, Footer, Header, PageNumber, TableOfContents } = require("docx");

const W = 9360; // content width, US Letter with 1" margins
const INK = "1B1B2F", ACC = "5B47D6", SOFT = "6B6B80", LINE = "D9D6F0", HEAD = "EEEAFB";
const run = (t, o = {}) => new TextRun({ text: t, font: "Calibri", size: 22, color: INK, ...o });
const P = (t, o = {}) => new Paragraph({ spacing: { after: 120, line: 276 }, ...o, children: Array.isArray(t) ? t : [run(t)] });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, spacing: { before: 0, after: 200 }, children: [new TextRun({ text: t, font: "Calibri", bold: true, size: 36, color: ACC })] });
const H1n = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 }, children: [new TextRun({ text: t, font: "Calibri", bold: true, size: 36, color: ACC })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 }, children: [new TextRun({ text: t, font: "Calibri", bold: true, size: 28, color: INK })] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 }, children: [new TextRun({ text: t, font: "Calibri", bold: true, size: 24, color: ACC })] });
const B = (t, lvl = 0) => new Paragraph({ numbering: { reference: "bul", level: lvl }, spacing: { after: 60, line: 264 }, children: Array.isArray(t) ? t : [run(t)] });
const bold = (t) => run(t, { bold: true });
const BL = (label, text) => B([bold(label + " "), run(text)]);
const NB = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: NB, bottom: NB, left: NB, right: NB };

function table(widths, header, rows) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cell = (t, w, hd, i) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders, margins: { top: 70, bottom: 70, left: 100, right: 100 },
    shading: hd ? { type: ShadingType.CLEAR, fill: HEAD, color: "auto" } : undefined,
    children: String(t).split("\n").map((line) => new Paragraph({ spacing: { after: 20 }, children: [run(line, { size: 19, bold: hd || (i === 0 && !hd) && false })] })),
  });
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: widths,
    rows: [new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, widths[i], true, i)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i], false, i)) }))],
  });
}
const gap = () => P("", { spacing: { after: 80 } });
const callout = (t) => new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], rows: [new TableRow({ children: [new TableCell({ width: { size: W, type: WidthType.DXA }, borders: { top: NB, bottom: NB, right: NB, left: { style: BorderStyle.SINGLE, size: 24, color: ACC } }, shading: { type: ShadingType.CLEAR, fill: "F6F4FE", color: "auto" }, margins: { top: 100, bottom: 100, left: 160, right: 140 }, children: (Array.isArray(t) ? t : [t]).map((x) => new Paragraph({ spacing: { after: 60 }, children: [run(x, { size: 21 })] })) })] })] });

const c = [];

// ---------------- cover
c.push(new Paragraph({ spacing: { before: 2400, after: 120 }, children: [new TextRun({ text: "MILA", font: "Calibri", bold: true, size: 96, color: ACC })] }));
c.push(new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Product, design and audit brief", font: "Calibri", size: 44, color: INK })] }));
c.push(P("Everything about Mila in one place: what it does, how it is built, how it looks, what is broken, and how it compares with competitors. Written so an outside reviewer can audit the idea and tell us what to keep, add, cut and reorder.", { spacing: { after: 400 } }));
c.push(table([2400, 6960], ["", ""], [
  ["Version", "October 10, 2026. Public launch planned for October 20, 2026 at 10:00 AM Eastern."],
  ["Prepared by", "The Mila team (NorthCo). Contact: admin@milarealestate.app"],
  ["Status", "Confidential. Contains cost, architecture and vendor detail. Share only with the reviewer."],
  ["Honesty rule", "Every claim in this document is marked as built and tested, built but not verified live, planned, or unverified. Competitor facts are cited or labeled as owner-reported."],
]));
c.push(new Paragraph({ children: [new PageBreak()] }));
c.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Contents", font: "Calibri", bold: true, size: 36, color: ACC })] }));
c.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }));

// ---------------- 0 how to use
c.push(H1("1. Start here: what we want from the reviewer"));
c.push(P("Mila is a mobile-first web app (installable as a phone app) that acts as an AI operations manager for solo US real estate agents. The agent types or speaks what they need in plain English and Mila does the busywork: calendar, showings, open houses, follow-ups, listing prep, social posts, emails and texts. Nothing goes out without the agent's approval."));
c.push(P("We are about ten days from launch with a small invite-only group (25 seats). A competitor, SERHANT., just released S.MPLE 2.0, an AI platform that reportedly coordinates many specialized agents and proactively directs an agent's day. We do not own a brokerage, so we cannot bring the same built-in client flow. We need an honest outside view on where Mila should be different, what to add, what to remove and how the pieces should flow."));
c.push(H3("The questions we most want answered"));
[
  "Positioning: is \"AI operations manager for real estate agents\" a clear, defensible idea for an independent agent who does not work for a mega-brokerage? Who is the first customer, exactly?",
  "Feature value: which features in Section 4 would an agent pay for, which are nice-to-have and which are clutter? Rank them.",
  "Missing features: compared with S.MPLE 2.0, Lofty, Follow Up Boss, kvCORE/BoldTrail, Structurely, Sierra and VERA (Section 9), what do agents expect that Mila lacks? What can Mila skip?",
  "Flow: is the path from sign-up to the first win fast enough? Is the home screen, chat, approvals and calendar arrangement right? What should be proactive instead of asked for?",
  "Trust and risk: where could Mila embarrass an agent (wrong facts in a post, a wrong text, a wrong address)? What guardrails are missing?",
  "Pricing and economics: are $29 and $49 per month right? Is the trial (7 days, 100 credits) enough to show value without losing money?",
  "Moat: what keeps Mila ahead once a big brokerage or CRM ships the same thing? Is the \"learns how each agent works\" idea real enough to build the product around?",
  "Quality: the known bugs and gaps in Section 8, in what order should they be fixed before launch?",
].forEach((q) => c.push(B(q)));
c.push(H3("How to read the status labels"));
c.push(table([2000, 7360], ["Label", "Meaning"], [
  ["Built", "Works in the app and is covered by automated tests."],
  ["Built, not verified live", "Code exists and passes tests, but it depends on an outside service or a device we have not confirmed in production (for example photo providers or iPhone behavior)."],
  ["Partial", "Works for the main case; known gaps are listed."],
  ["Planned", "Designed or promised, not built."],
  ["Unverified", "A claim we could not confirm (used for competitor claims)."],
]));

// ---------------- 2 executive summary
c.push(H1("2. Executive summary"));
c.push(H3("What Mila is"));
c.push(P("One assistant that runs an agent's day on their phone. The agent says \"I have a showing with the Turners at 123 Main Street tomorrow at 2\" and Mila puts it on the calendar, checks for conflicts, saves the home, drafts the text to the client and offers an Instagram post, then waits for approval before anything is sent. It remembers each client and home, and prepares briefs for meetings and listings."));
c.push(H3("What is working today"));
[
  "A chat agent that handles about 40 kinds of requests (calendar, contacts, listings, open houses, showings, posts, emails, texts, market questions) with a fast rule-based engine first and an AI model for open-ended questions. Most turns cost nothing in AI.",
  "Real property data: address lookup, beds/baths/size/price, taxes, year built, estimated value, comparable homes, new and rental listings, and street-view photos of any address.",
  "Social content: Instagram carousels (3 images), Instagram stories and TikTok (1 image), six color palettes, eight headline fonts, several layouts, real photos, profile photo and contact details drawn on the images.",
  "Safety and cost controls: approval before sending, per-user AI budgets, a $20 hard cap across all trial users, locks on paid lookups when credits run out.",
  "A separate internal dashboard (\"Mila OS\") for waitlist, invites, spend, errors, tester bug reports and a social-posting board.",
  "Automated checks: 326 unit and conversation tests plus a 1,868-scenario generated conversation suite (10 known baseline misses, Section 8).",
].forEach((t) => c.push(B(t)));
c.push(H3("What is not working or not proven"));
[
  "Mila does not send messages itself. Email opens the agent's own mail app and texts open Messages. This is deliberate (trust, and carrier text registration takes weeks) but it is a gap against competitors that text leads automatically.",
  "No MLS or CRM connection yet. Mila works from what the agent says, public data lookups and (once configured) Google and Microsoft calendar and mail.",
  "Several recent fixes (iPhone sheet layout, new post designs, fonts) were built and tested in a desktop browser but not yet confirmed on a real phone in production.",
  "Posts are not published automatically. The agent saves the images and posts them.",
].forEach((t) => c.push(B(t)));
c.push(callout(["Our honest read of the gap: S.MPLE 2.0 is described as proactive (it decides what needs attention each day across calendar, email and CRM) and backed by a brokerage's data and human advisors. Mila is reactive (the agent asks) with a few proactive pieces (a daily summary, a priorities list, a \"what am I forgetting today\" brief). The biggest strategic question for the reviewer is how far to push Mila toward proactive, and what data it needs to do that without a brokerage behind it."]));

// ---------------- 3 vision
c.push(H1("3. Vision, positioning and principles"));
c.push(H3("One-line positioning"));
c.push(P("Your AI operations manager for real estate. Not a generic AI productivity app."));
c.push(H3("Who it is for"));
c.push(P("US real estate agents, solo first, then teams and brokerages. The first 25 users are invited from a waitlist built through short videos on Instagram, X and TikTok."));
c.push(H3("The wedge"));
c.push(P("One assistant that runs the whole day across the tools agents juggle today (CRM, marketing, transaction tracking, generic chat AI, a virtual assistant) in plain English, with an approval step, on the phone. Nobody should need five apps."));
c.push(H3("Principles we hold ourselves to"));
[
  "Mila never sends, posts or deletes anything without the agent's OK.",
  "No fake features: anything not connected says Connect or Coming soon. Facts found online are flagged for the agent to check and never presented as verified.",
  "No vendor or backend names, and no source links, visible to users.",
  "US spelling only (the product is US-only).",
  "Mobile first. It must feel like a native app: smooth, no glitches, usable one-handed.",
  "Strong AI cost protection so a free trial cannot run up a bill.",
].forEach((t) => c.push(B(t)));
c.push(H3("Voice"));
c.push(P("Calm, specific, in charge of the busywork. Short sentences. Always a clear next step. No hype. Texts and emails drafted for the agent must sound like a friendly person, not a template."));
c.push(H3("The four demo tests that must always work"));
[
  "\"Set me up for my open house\" with no address given.",
  "Meeting prep for a client.",
  "Showing follow-ups.",
  "\"What am I forgetting today?\"",
].forEach((t) => c.push(B(t)));
c.push(H3("The moat we are betting on"));
c.push(P("Mila progressively learns how each agent works (style, timing, templates, which answers they rate useful) so it gets better the longer it is used. Today this is partly built: a memory of facts about contacts and homes, silent learning from \"Useful / Missing something / Wrong\" ratings, and saved preferences. A deeper \"learns your operating style\" layer is not built."));

// ---------------- 4 features
c.push(H1("4. Feature inventory"));
c.push(P("Grouped by what the agent is trying to get done. The last column is the status label defined in Section 1."));
const F = (title, rows) => { c.push(H2(title)); c.push(table([2300, 5560, 1500], ["Feature", "What it does today", "Status"], rows)); c.push(gap()); };

F("4.1 The chat agent (the heart of the app)", [
  ["Plain-English requests", "One message can contain several things (\"showing Friday at 3 with the Smiths and remind me to call Dana\"). Mila splits it, does each part and says what she did. A follow-up like \"actually make it 4\" changes the last thing she did.", "Built"],
  ["Rule-based engine first, AI second", "About 40 intents (calendar, contacts, listings, posts, drafts, research) are recognized by rules at zero AI cost. Unclear or open-ended requests go to an AI model. If the AI budget is out, Mila falls back to rules and says so once.", "Built"],
  ["Asks only what she must", "Missing address, date or name triggers one short question. The answer continues the request (it is not treated as a new one). A different request cancels the old question.", "Built"],
  ["Approvals", "Anything customer-facing waits in \"Ready for approval\" with Approve, Edit and Decline. Calendar changes the agent makes by instruction go through directly.", "Built"],
  ["Cards instead of walls of text", "Answers come back as cards: events, listing cards, rental cards, a week card, a call-outcome card, advice and script cards with Copy, quick-question forms, photo-share cards.", "Built"],
  ["Voice input", "Dictate a message; also used to log a call in one sentence.", "Built, not verified live on all phones"],
  ["Rate every reply", "\"Useful / Missing something / Wrong\" after replies. Ratings silently improve future answers for that agent.", "Built"],
  ["Flag a bug", "Testers get a flag button over every screen that sends the page, the last messages and the device to the team.", "Built"],
]);
F("4.2 Calendar, showings and open houses", [
  ["Create / move / cancel events", "Showings, open houses, calls, lunches, closings, listing appointments. Corrections replace the old time (no duplicates). Cancel shows what will be canceled and offers to email or text the client to reschedule.", "Built"],
  ["Conflict checks", "Warns if the new event overlaps one already there (including events happening right now) and offers keep / move / find another time.", "Built"],
  ["Time off", "\"I'm out Friday\" blocks the day and offers one tap to push everything booked that day to the first day back.", "Built"],
  ["Calendar sync", "Google and Microsoft (OAuth) and an Apple calendar link. Needs the owner's keys and, for Gmail, a Google verification review.", "Built, not verified live"],
  ["Open house workflow", "From one sentence: event, prep reminder, checklist tasks, invitation email to the contact list, Instagram carousel, sign-in sheet follow-up.", "Built"],
  ["Showing sheets", "A checklist to walk a home with notes, photos and video, saved to the property.", "Built"],
  ["Event cards with photos", "Home and Calendar show each home's photo, with directions, follow-up and \"send details by text\".", "Built"],
  ["Reminders on the calendar", "Reminders are listed under the day they fire.", "Built"],
  ["Nearby vendor suggestion on reminders", "Not built.", "Planned"],
]);
F("4.3 Contacts and follow-up", [
  ["Contacts and pipeline", "Clients with type (buyer, seller, renter, investor, lead, past client), status, budget, area, timeline, notes, tags and a stage view.", "Built"],
  ["Add a client by sentence", "\"New buyer Priya, 3 bed around $500k in Rockville\" saves the client, searches criteria and (for buyers) shows a Find listings button. Sellers get no automatic call task.", "Built"],
  ["Quick questions card", "After adding a client, one small form (budget, area, bedrooms, timeline, pre-approved) saved in one tap.", "Built"],
  ["Who to follow up with", "A short ranked list of people truly due this week, each with Open contact and Draft follow-up. New leads get a grace period.", "Built"],
  ["Log a call", "\"I just talked to Priya, she wants to see houses this weekend\" saves the note, the facts it learned and a follow-up, and returns a call-outcome card.", "Built"],
  ["Import people", "Paste or upload a sign-in sheet, contacts or notes; Mila finds the people, avoids duplicates and tags the source.", "Built"],
  ["Couples, families, matching sellers to buyers", "Partly: matching buyers to a home by budget, beds and area works. Auto-connecting a new seller to matching contacts is not built.", "Partial"],
  ["Unified inbox (texts, calls, email, leads)", "Not built.", "Planned"],
]);
F("4.4 Properties and listings", [
  ["Add a listing in one message", "Address plus anything known. Mila saves it, looks up the rest, links sellers and offers next steps. She assumes the agent's own market when no city is given and says so.", "Built"],
  ["Property kinds", "Residential, multifamily, commercial and land are told apart: what Mila asks for, what shows on the card, and how posts are worded. A landmark on the map (a capitol, a ballpark) triggers \"is this a home?\" before saving.", "Built, not verified live"],
  ["Property page", "Photo gallery first (the agent's own photos, then public listing photos, then street view as the standard image), facts with a confirm checkbox, events, showing sheet, find-photos-from-a-link, delete.", "Built"],
  ["Properties tab", "Cards with photo and numbers, filtered by Needs work, Current, Upcoming, Past, All and by on/off market.", "Built"],
  ["Prep for an address", "Pulls facts, estimated value with range, last sale, taxes, comparable homes, active status and days on market, with what is worth knowing. Open-house prep says what Mila already did.", "Built"],
  ["Listing readiness brief", "A checklist of what is done and missing (seller, date, photos, agreement, comps, open house, post, tasks). Pre-fills from the lookup.", "Built"],
  ["Listing agreement worksheet + PDF", "Asks first, then a pre-filled form (sellers, price, commission, term, start, included/excluded, notes) and a PDF to review with the seller. It is a worksheet, never legal contract language.", "Built"],
  ["Pet policy check", "Answers from what is saved on each home and marks unknowns with a one-tap way to record them.", "Built"],
  ["Transaction checklist", "\"Offer accepted, closing Nov 20\" builds the timeline of deadlines with reminders.", "Built"],
  ["MLS / CRM connection", "Not built. Access depends on each broker's or association's data license.", "Planned"],
]);
F("4.5 Market data and research", [
  ["New listings", "The newest active listings in an area as swipeable cards with Save and Prep.", "Built"],
  ["Rentals for a client", "Up to five rental cards with pet policy, then \"who are these for?\" and saved to the client's profile (not Properties).", "Built"],
  ["Market research", "A short, sourced-internally market read for an area (sources hidden from users). Costs more credits and is capped monthly.", "Built"],
  ["Client search briefs", "Several requirements for a client are routed to a research mode with trade-offs and an unverified list.", "Built"],
  ["Scripts and advice", "Phone, meeting, text or email scripts and how-to answers (for example earnest money) shown as step cards with Copy and \"make it an email/text to this client\".", "Built"],
]);
F("4.6 Content and social posts", [
  ["Post types", "Just listed, open house, price improvement, just sold, buyer tip, seller tip, education, market update, local, personal brand.", "Built"],
  ["Formats", "Instagram post = 3-image carousel. Instagram story and TikTok = one 9:16 image carrying all details. Captions end with the agent's signature, up to five hashtags.", "Built"],
  ["Carousel structure", "Cover: photo, address, chips (day/time, price, beds, baths, size) and a small profile photo. Highlights: price and size, every extra fact we know and the agent's own description, with a strip of the home's other photos. Last image: the agent's photo large in the center with name, brokerage, phone, email and team.", "Built (new Oct 10, not verified live)"],
  ["Tips posts", "\"3 tips for first-time buyers\" makes exactly that many on a numbered list image; the agent's own tips typed in the note come first, Mila fills the rest.", "Built"],
  ["Sold posts", "A big SOLD image, plus a congratulations image only when a client name is given.", "Built"],
  ["Editor", "Autosave; Design (layout), Font (8 choices), Colors (6 palettes), Photos (add, replace, per-slide or all), full-screen viewer, save to Photos.", "Built"],
  ["Photos", "Each post uses its own home's photos; if none, the street view of the address. A post never borrows another home's photos.", "Built"],
  ["Auto-publishing", "Not built. The agent saves images and posts manually.", "Planned"],
  ["Mila OS social board", "Internal board for the team's own X/TikTok/Instagram posts with view and like tracking by link.", "Built"],
]);
F("4.7 Email and texts", [
  ["Text drafts", "Warm, natural wording using what Mila knows. \"Open in Messages\" opens the phone's text app ready to send.", "Built"],
  ["Email drafts", "Written like a friendly person; the agent edits and opens it in their own mail app (or Gmail). Open-house invitations go to a chosen audience.", "Built"],
  ["Photos with a message", "Only when the agent asks (\"…with photos\"), their own uploaded photos appear in a card that shares to Messages or Mail.", "Built, not verified live"],
  ["Sending from Mila's own number or inbox", "Not built (needs carrier registration for texts). Considered and deferred.", "Planned"],
]);
F("4.8 Memory, documents and templates", [
  ["Memory", "Facts about contacts and homes the agent has told Mila, editable in a Memory screen. Internal lookup caches are hidden.", "Built"],
  ["Documents", "Upload a PDF or sheet; Mila reads it, summarizes it and can fill the agent's own templates (never invents legal language).", "Built"],
  ["Templates", "The agent's own buyer and seller documents used to prepare intake paperwork.", "Built"],
]);
F("4.9 Home, settings, billing and admin", [
  ["Home", "Greeting, today's priorities, event photo cards, daily summary, first-week checklist.", "Built"],
  ["Daily summary email", "Sent only to people who used Mila recently; needs a cron secret and mail keys on the main project.", "Built, not verified live"],
  ["Settings", "Profile and brand (photo, phone, credentials, team), appearance (day, night, follow the sun), connections, credits, automation (ask every time or automatic), privacy and export.", "Built"],
  ["Billing", "Stripe plans, top-ups, promo codes, customer portal for cancel and card changes.", "Built, not verified live"],
  ["Install as a phone app", "A prompt to add to the Home Screen appears only after login on mobile. Zooming is disabled to feel native.", "Built"],
  ["Mila OS (internal admin)", "Overview, users, funnel, errors, AI spend by feature and by user, waitlist, invites with seat cap, tester feedback, launch checklist, one-tap tester credit top-up. Two profiles (Ryan: everything; Sarah: social only).", "Built"],
  ["Waitlist website", "Public landing with signup, queue email, and a chat box for questions.", "Built"],
  ["Google sign-in", "Wanted a few days after launch. Today: email and password plus an access code.", "Planned"],
  ["Team plan (shared pipeline, logo, invite links)", "Shows as Contact us only.", "Planned"],
]);

// ---------------- 5 how it works
c.push(H1("5. How Mila works (plain-English architecture)"));
c.push(H3("A request, step by step"));
[
  "The agent types or speaks a message in the chat (a floating Ask Mila button is on every screen).",
  "Cleanup: filler words, \"it/that\" are rewritten to the last home or person in the conversation; greetings are stripped.",
  "Intent detection by rules (around 40 intents). If the rules are unsure, a small, cheap AI model classifies it.",
  "A handler does the work with the agent's saved data (calendar, contacts, properties, memory) and, when needed, a paid data lookup for property facts or photos. Each lookup is checked against the user's credits and monthly limits first.",
  "Anything that would go to another person is placed in approvals. The reply comes back as text plus cards with next-step buttons.",
  "Every AI call is recorded with its real cost so margin per user is visible.",
].forEach((t, i) => c.push(new Paragraph({ numbering: { reference: "num", level: 0 }, spacing: { after: 60 }, children: [run(t)] })));
c.push(H3("Technology (for the technical reviewer)"));
c.push(table([2600, 6760], ["Layer", "Choice"], [
  ["App", "Next.js 16, React 19, TypeScript, Tailwind v4. Installable web app (PWA). Three separately deployed projects: the main app, the internal admin (Mila OS) and the public waitlist."],
  ["Hosting and data", "Vercel (hosting) and Supabase (database, login). Migrations 0001 to 0011."],
  ["AI", "OpenAI models in three tiers (fast for routing, standard for drafts, reasoning for hard and strategic questions). Swappable by configuration. Output size and token limits, daily global cap, per-user caps."],
  ["Property data", "RentCast for address facts, value estimates, comparables, listings and rentals (about $0.074 per request). Google geocoding and Street View for locating and photographing addresses. A photo provider for listing photos, capped per plan."],
  ["Payments and email", "Stripe for subscriptions. Resend for email from the app's domain."],
  ["Calendars and mail", "Google and Microsoft via OAuth; Apple calendar via a public calendar link."],
  ["Images", "Post images are drawn in the browser on a canvas. There is no image-generation cost, and what the agent previews is exactly what is exported."],
]));
c.push(H3("Cost protection (important for a free trial with no card)"));
[
  "Most turns are rule-based and cost nothing in AI. A 50-question stress run cost about $0.60 in total (about $0.012 per question).",
  "Trial: 100 credits, about $0.50 of AI, 2 live listing lookups and 3 photo lookups per person. All trial users together are capped at $20 in real cost (25 seats at launch). When the pool is empty the open-ended answers pause; calendar, contacts, tasks and drafts keep working.",
  "Paid plans: AI budget stays under 30% of the price; worst-case total cost (AI, data lookups, photo lookups, card fees) is held under 60% of the price by an automated test.",
  "Paid lookups are locked when credits are out. Test accounts are exempt and get a monthly AI allowance.",
].forEach((t) => c.push(B(t)));

// ---------------- 6 design
c.push(H1("6. Design"));
c.push(H3("Look and feel"));
c.push(P("One continuous look from the waitlist site into the app: a soft sky gradient (blue to violet to peach), white glass-like cards, Instrument Serif for headlines and Inter for text, and a purple accent. Day, night and follow-the-sun themes. The goal is that nothing feels like a new product after signing up."));
c.push(H3("Navigation"));
c.push(P("Phone: a floating bottom bar with Home, Contacts, Properties, Content, Calendar and More, plus an Ask Mila button that opens the chat as a sheet. Desktop: a left rail with the same destinations. More holds Tasks, Documents, Templates, Memory, Workflows, Showings and Settings."));
c.push(H3("Screens"));
c.push(table([2200, 7160], ["Screen", "Purpose"], [
  ["Home", "What needs you today: priorities, event cards with photos, approvals waiting, first-week checklist."],
  ["Chat (sheet)", "Everything is done here in plain English; replies carry cards and buttons."],
  ["Calendar", "Day strip and the day's events with photo cards; reminders; sync controls."],
  ["Contacts", "People with stage, priority and next step; a profile with history, notes, memory and a needs-to-happen card."],
  ["Properties", "Cards with photo and numbers; tabs: Needs work, Current, Upcoming, Past, All; filters for on or off the market."],
  ["Property page", "Photos first, find photos from a link, facts, events, showing sheet, worksheet and PDF."],
  ["Content", "Drafts and the editor with Design, Font, Colors and Photos controls."],
  ["Approvals (review sheet)", "Edit, approve or decline each draft email, text or post; posts show the real rendered images."],
  ["Settings", "Profile and brand, appearance, connections, credits and plan, automation, privacy."],
]));
c.push(H3("The post design system"));
c.push(table([2200, 7160], ["Part", "Detail"], [
  ["Formats", "Instagram post 4:5 portrait, 3 images. Instagram story and TikTok 9:16, 1 image."],
  ["Palettes (6)", "Noir, Paper, Sand, Forest, Clay, Sky. Changing colors never changes the font."],
  ["Fonts (8)", "Classic, Elegant, Luxury, Bold serif, Traditional, Modern, Clean, Poster."],
  ["Layouts", "Several cover and content layouts (panel, cinema full photo, ticket, marker, polaroid, poster, split, arch, badge, stack). Photo layouts need a photo."],
  ["Content images", "Stat tiles for a few numbers; check-mark highlight rows with a photo strip; numbered tip rows; a centered host card with the agent's photo and contact details."],
  ["Reference", "The owner supplied an agent's open-house flyer (event time banner, address block, price tag, a property highlights list, three room photos, host contact bar) as the target for density of information. Our carousel spreads those same elements across three images."],
]));
c.push(H3("Design problems we know about"));
[
  "The new post layouts were verified with generated sample photos, not yet with real property photos on a phone. Text over bright photos may need a stronger shade.",
  "An iPhone installed-app layout bug left a blank strip below bottom sheets. A fix (render sheets at the top of the page) is shipped to code but not confirmed on a phone.",
  "On iPhone, tapping into a field on the Home Screen app could fail to bring up the keyboard. Several fixes were tried; we decided on login in the browser, then add to Home Screen. Not fully resolved.",
  "The email draft card still looks like a form. It should feel like a message.",
  "The owner reports some screens still look \"meh\" and busy; a designer's pass on spacing, hierarchy and empty states is wanted.",
].forEach((t) => c.push(B(t)));

// ---------------- 7 pricing
c.push(H1("7. Pricing, trial and unit economics"));
c.push(table([2200, 1700, 1700, 3760], ["Plan", "Price / month", "Credits / month", "Notes"], [
  ["Trial", "Free, 7 days, no card", "100", "About $0.50 of AI, 2 listing lookups, 3 photo lookups per person; $20 pool across all trial users; 25 seats at launch."],
  ["Mila Standard", "$29", "700", "AI budget about $8; shallower research run."],
  ["Mila Premium", "$49", "1,400", "AI budget about $14; top reasoning model; more lookups."],
  ["Team", "Contact us", "n/a", "A placeholder plan; no shared pipeline, team logo or invite links yet."],
  ["Top-ups", "$0.05 per credit", "100 to 5,000", "Always pricier per credit than a plan so subscribing is better."],
]));
c.push(gap());
[
  "A heavy day is about 45 credits (about 900 a month). Standard fits a normal user; heavy users top up or choose Premium.",
  "Worst-case gross margin if a user spends the full AI budget: about 72% (Standard) and 71% (Premium). Typical use costs far less. These credit numbers are a first guess to be re-checked after launch week.",
  "Promo planned: half off the first month.",
  "Competitor reference prices are in Section 9. Mila is far cheaper than CRM suites and VERA ($149/month) but it also does less (no lead capture, dialer, website or MLS).",
].forEach((t) => c.push(B(t)));
c.push(callout("Question for the reviewer: is a low price an advantage (easy yes for a solo agent) or a signal of a toy? Would a higher price with a done-for-you promise (like S.MPLE's human advisors) convert better?"));

// ---------------- 8 bugs
c.push(H1("8. Quality, known bugs and gaps"));
c.push(H3("How we test"));
[
  "326 automated tests (conversation flows, content, pricing math, tenant isolation, cost limits) pass on every change.",
  "A generated suite of 1,868 conversation scenarios runs end to end; 1,858 pass. The 10 misses are one known case (a scenario where the test expects a question about a missing address but Mila uses the agent's latest listing and says so). It is a baseline, not a regression.",
  "Five rounds of 50 realistic agent questions across real addresses in many states; testers flag problems with a button and each report is tracked.",
  "Browser audits at phone and desktop sizes for overlap, clipping and scroll issues.",
].forEach((t) => c.push(B(t)));
c.push(H3("Open issues, most important first"));
c.push(table([500, 2500, 4560, 1800], ["#", "Issue", "Detail and impact", "Severity"], [
  ["1", "Several fixes not confirmed on a real phone", "Sheet layout strip on iPhone installed app, new post layouts with real photos, font rendering, share-photos card. Risk: visible glitches at launch.", "High"],
  ["2", "iPhone Home Screen keyboard focus", "Tapping fields in the installed app can fail to focus. Workaround: log in in the browser first.", "High"],
  ["3", "Outside services unverified in production", "Landmark detection, photo provider, Gmail/Outlook/Apple sync, Stripe live checkout, daily email. All built; none confirmed end-to-end with live keys.", "High"],
  ["4", "Deploy pipeline limits", "The hosting plan hit a daily deployment limit earlier and a GitHub rate limit on October 10. Upgrading the hosting plan is required before charging customers.", "High"],
  ["5", "Street View can show the wrong building", "Addresses without a city and state are not photographed (to avoid the wrong house); some photos show the neighbor or a street. Needs a location-vs-address check.", "Medium"],
  ["6", "No MLS data, so facts can be thin", "Public lookups can miss new or odd properties; posts then carry fewer details. Mila never invents numbers, so sparse homes make sparse posts.", "Medium"],
  ["7", "Posts are not published", "Agents must save and upload manually. A competitor-level expectation is scheduling and auto-posting.", "Medium"],
  ["8", "Google Cloud trial ends in late October", "Street View stops working without a paid billing upgrade.", "Medium"],
  ["9", "Email and text sending is manual", "By design, but a lot of friction compared with automated competitors.", "Medium"],
  ["10", "Free-text parsing is rule-based", "Unusual phrasing can misroute (past examples: a complaint saved as a name, \"I just talked to X\" read as a new contact). Each is fixed with a test, but the class of bug remains.", "Medium"],
  ["11", "Open items from the tester bug list", "Event time zones for out-of-state homes, nearby-vendor suggestions on reminders, saved searches per client with groups (Top picks, Maybe, Toured), commercial invite wording, and decisions on landmark confirmation and out-of-office behavior.", "Low to medium"],
  ["12", "Credit numbers unproven", "Plan credits and costs are estimates until real usage arrives.", "Low"],
]));
c.push(H3("Classes of bug we already fixed (evidence of how the product behaves under pressure)"));
[
  "Dates and times: weekday rollovers, \"4-5 hours\" misread as 4 to 5 PM, same-day events already in progress, corrections creating duplicates.",
  "Names and data: verbs and complaints saved as people, couples and families, first-name-only follow-ups.",
  "Addresses: landmarks saved as homes, plazas and squares not recognized, assumed city and state.",
  "Posts: no images, wrong sizes, \"open house\" on everything, 3 images where 1 was wanted, wrong home chosen, no details, previews not refreshing after a font change.",
  "Privacy and trust: source names showing to users, vendor names, raw internal tags.",
  "Cost: trial users and testers hitting limits at the wrong time, paid lookups running with no credits.",
].forEach((t) => c.push(B(t)));

// ---------------- 9 competitors
c.push(H1("9. Competitive landscape"));
c.push(callout(["Sourcing note: items below come from public trade press and review sites found on October 10, 2026, or from the owner's own use. Pricing for several competitors is not published and varies by source. Treat all numbers as estimates and request written quotes before relying on them. Company performance claims are the company's own."]));
c.push(H2("9.1 SERHANT. S.MPLE 2.0 (the reference competitor)"));
c.push(table([2600, 6760], ["Topic", "What we know"], [
  ["What it is", "SERHANT.'s AI platform for its agents. Version 1 (2024) was an AI-supported service where agents sent requests by voice or text and company advisors reviewed the work. Version 2.0 is described as an \"AI chief of staff\" coordinating dozens of specialized agents and tools across market analysis, listing presentations, marketing, transaction coordination, compliance and client follow-up. (HousingWire, Inman)"],
  ["The big shift", "From completing tasks on request to working toward goals. A goal such as preparing for a listing appointment is broken into steps from market research to compliance checks. The assistant (named Dot, per Inman) reads across the agent's calendar, email and CRM and decides what needs attention each day. The company frames it as the AI directing the agent rather than the agent directing the AI."],
  ["Rollout", "Starting early October 2026 for SERHANT. agents, expanding across markets through Q4. (HousingWire)"],
  ["Claimed results", "The company says agents using S.MPLE grew commission income by an average of 144%. Unverified; company claim."],
  ["Reported by the owner", "Strong app reviews (185 five-star reviews reported by the owner), low marketing and social presence. We could not find an App Store listing or rating in public search, so treat the review count as owner-reported and unverified."],
  ["Structural advantages", "A large brokerage supplies listings, leads, brand, data, human advisors and a built-in captive user base. S.MPLE is a benefit of working at SERHANT., not an app an independent agent can simply buy (to our knowledge; unverified)."],
  ["What it means for Mila", "Mila cannot copy the data and the client flow. It can be the independent agent's version: available to anyone, cheaper, faster to start, and proactive on the data an agent can give it (calendar, mail, contacts). The questions are how proactive to get and which of the \"goal\" workflows (listing appointment prep, transaction coordination) to build first."],
]));
c.push(gap());
c.push(P([run("Sources: ", { bold: true }), run("HousingWire, \"SERHANT dot S.MPLE 2\" (housingwire.com/articles/serhant-dot-smple-2/); Inman, \"SERHANT S.MPLE 2.0 AI real estate agents\" (inman.com/2026/09/23/serhant-simple-2-0-ai-real-estate-agents/); SERHANT S.MPLE page (serhant.com/smple); Business Wire release (December 2025) on the T-Mobile partnership.", { size: 19 })]));
c.push(H2("9.2 Other competitors and substitutes"));
c.push(table([1800, 3300, 2500, 1760], ["Product", "What it does", "Price (reported)", "Confidence"], [
  ["Lofty (formerly Chime)", "All-in-one: CRM, IDX website, dialer, SMS, marketing automation and an AI assistant; an AI sales agent can text leads around the clock.", "Not published. Third-party sources list from about $449 per month (up to 3 users) rising to $899+; estimates $499 to $1,000+ per seat with AI add-ons.", "Medium (third-party reviews)"],
  ["Follow Up Boss", "CRM focused on lead follow-up. In 2025 launched native AI that drafts replies, summarizes threads and suggests next actions. Open API lets teams plug in their own AI.", "Published: Grow $69 per month per user; Pro $499 per month (10 users); Platform $1,000 per month (30 users).", "Medium"],
  ["kvCORE (BoldTrail)", "CRM, IDX website, dialer and an AI assistant (Alex) that handles inbound lead conversations 24/7 by text.", "Not published. Estimates about $499 entry to $749 mid-tier per month.", "Low to medium"],
  ["Structurely", "Dedicated AI lead qualifier that converses with leads. A vendor case study cites appointment conversion rising from 5% to 15% (marketing claim).", "Not found.", "Low"],
  ["Sierra Interactive", "Lead platform that added AI lead routing and AI-drafted responses in 2025.", "Not found.", "Low"],
  ["VERA (meetmyvera.com)", "A generic small-business AI assistant with approvals, an inbox, pipeline and a business phone number with an AI receptionist and texting. Built for trades and small business, with real estate bolted on. The owner reviewed it by hand on October 8; see the teardown below.", "$149 per month after a 7 or 14 day trial; trial capped at 20 approved actions.", "High (owner's own account)"],
  ["Generic AI chat (ChatGPT etc.)", "Strong at writing and advice but has no calendar, contacts, property data or approvals, and forgets between chats.", "$0 to $20+ per month.", "General knowledge"],
]));
c.push(gap());
c.push(P([run("Sources: ", { bold: true }), run("Dupple, \"8 Best AI for Real Estate in 2026\"; DM Champ, \"Best AI tools for real estate 2026\"; Dupple, \"Best CRM for Real Estate (2026)\"; Retell AI blog on AI tools for agents; Luxury Presence, \"Lofty Pricing 2026\"; Layer3 Labs, \"AI real estate CRM\"; Toolradar, Chime alternatives. Several of these sites sell or promote competing products.", { size: 19 })]));
c.push(H2("9.3 What the VERA teardown taught us (owner's own account, October 8)"));
[
  "VERA did not do the one-sentence job. For the same request (a showing with a family tomorrow) it asked clarifying questions, gave a generic checklist and completed one of five asked things. Mila added the showing, drafted the text and drafted the post.",
  "VERA's bugs: junk business names accepted and reused, internal tags visible in a reply, a complaint saved as a lead name, repeated questions.",
  "VERA's strengths to learn from: a unified Inbox (texts, calls, email, leads), a Pipeline with a priority score and next step per row, a visible counter of actions left, a Get-working checklist, a Simple/Advanced toggle, and a business number with an AI receptionist.",
  "Lesson we adopted: never silently drop part of a multi-part request; validate names before saving.",
].forEach((t) => c.push(B(t)));

// ---------------- 10 matrix
c.push(H1("10. Feature comparison matrix (our best current view)"));
c.push(P("Legend: Yes = has it, Part = partly, No = does not, ? = we could not confirm. Competitor cells reflect public descriptions and are not guaranteed. This matrix is the main thing we want the reviewer to correct and complete."));
const Y = "Yes", N = "No", Pt = "Part", Q = "?";
c.push(table([2760, 1000, 1150, 1000, 1150, 1150, 1150], ["Capability", "Mila", "S.MPLE 2.0", "Lofty", "Follow Up Boss", "kvCORE", "VERA"], [
  ["Plain-English assistant that acts", Y, Y, Pt, Pt, Pt, Pt],
  ["Proactive daily direction (decides what needs attention)", Pt, Y, Pt, Pt, Pt, Pt],
  ["Goal-based multi-step workflows (e.g. listing appointment prep)", Pt, Y, Q, Q, Q, N],
  ["Calendar with conflict checks", Y, Q, Pt, Pt, Pt, Pt],
  ["Showings and open-house workflow", Y, Q, Pt, N, Pt, N],
  ["Contacts / pipeline with next steps", Y, Q, Y, Y, Y, Y],
  ["Lead capture, IDX website, lead routing", N, Q, Y, Pt, Y, N],
  ["AI that texts or qualifies leads automatically", N, Q, Y, Pt, Y, Y],
  ["Dialer / business phone number", N, Q, Y, Pt, Y, Y],
  ["MLS / listing data connection", N, Y, Y, Q, Y, N],
  ["Social posts and images made for listings", Y, Y, Pt, N, Pt, Pt],
  ["Auto-publishing / scheduling of posts", N, Q, Pt, N, Pt, Pt],
  ["Transaction timeline and compliance checks", Pt, Y, Pt, N, Pt, N],
  ["Property data (value estimate, comps, taxes) in chat", Y, Y, Pt, N, Pt, N],
  ["Approval before anything goes out", Y, Y, Pt, Pt, Pt, Y],
  ["Human advisors reviewing the work", N, Y, N, N, N, N],
  ["Open to any independent agent (not tied to a brokerage)", Y, N, Y, Y, Y, Y],
  ["Mobile-first, installable, voice", Y, Q, Pt, Pt, Pt, Pt],
  ["Starting price (per month)", "$29", "In-house", "~$449+", "$69", "~$499+", "$149"],
]));
c.push(gap());
c.push(P("Reading the matrix: Mila's clearest edge is doing real real-estate tasks from one sentence, for any independent agent, at a low price. The clearest gaps are lead capture and automatic lead conversations, a phone number, MLS data and proactive goal-driven workflows."));

// ---------------- 11 gap analysis
c.push(H1("11. Our hypotheses: add, cut and reorder (for the reviewer to challenge)"));
c.push(H2("11.1 Candidates to add"));
c.push(table([2900, 4660, 1800], ["Idea", "Why", "Effort (our guess)"], [
  ["A proactive morning plan (push or email) that reads calendar, contacts and email and says what to do first", "This is the core of S.MPLE 2.0 and the most visible gap. Mila already ranks follow-ups and writes a daily summary; making it the main thing could be the product.", "Medium"],
  ["Listing-appointment and open-house \"goal\" workflows as one tap (market read, comps, CMA outline, presentation, follow-up plan)", "Mirrors S.MPLE's example of goal-based planning. Many pieces already exist separately.", "Medium"],
  ["Email inbox reading and drafting replies in the agent's voice (Gmail/Outlook)", "Every competitor lives in the inbox. Needs the Google verification review.", "High"],
  ["Lead response: capture from forms or portals and draft an instant reply", "Where the money is for agents; Lofty, kvCORE, Structurely sell it.", "High"],
  ["Auto-scheduling and publishing of posts (Instagram and others)", "Removes the manual save-and-upload step.", "Medium to high"],
  ["Unified inbox and a next step on every contact row", "Seen in VERA; makes the pipeline actionable.", "Medium"],
  ["One-tap business number with an AI receptionist", "VERA offers it; carrier registration makes it slow.", "High"],
  ["Saved searches and shortlists per client (Top picks, Maybe, Toured)", "A natural client-service feature already requested by testers.", "Medium"],
  ["MLS or broker data partnership", "Accuracy and trust; unlocks real listing data.", "High, partner-dependent"],
  ["Team plan (shared pipeline, team logo, invites)", "Revenue per account and a path into brokerages.", "Medium"],
  ["A visible credits-left counter on Home and a first-week checklist", "Simple trust and activation wins seen in VERA.", "Low"],
]));
c.push(H2("11.2 Candidates to cut or simplify"));
[
  "Anything that looks like a form where a sentence would do (the email draft card, some settings).",
  "The Workflows and Templates screens, if few agents use them; fold them into the chat.",
  "Duplicate surfaces for the same thing (Tasks, Done and the priorities card) if they confuse a new user.",
  "Rarely used post types until the core four (just listed, open house, price improvement, just sold) are excellent.",
].forEach((t) => c.push(B(t)));
c.push(H2("11.3 Flow questions"));
[
  "First run: the goal is a working result in the first message (a showing on the calendar plus a draft). Is the onboarding too long or too short? Should Mila scan the agent's website or Instagram to learn style and listings first?",
  "Should the home screen be a feed of things Mila did and wants approval for (like an inbox), rather than a dashboard plus chat?",
  "Where do approvals live so they never feel like extra work? Today: inline cards in chat, a Home section and a review sheet.",
  "Should Mila ask less and assume more (assume the agent's market, assume 2 hours for an open house) with an easy undo?",
].forEach((t) => c.push(B(t)));
c.push(H2("11.4 Go-to-market questions"));
[
  "Launch is invite-only with 25 seats and a waitlist built from videos on Instagram, X and TikTok. Is that the right first channel for independent agents?",
  "How should we use the competitor teardown in content (a factual side-by-side video) without making claims we cannot prove?",
  "What proof would make an agent trust a new tool with their calendar and clients? Testimonials from named agents, a security page, a money-back promise?",
].forEach((t) => c.push(B(t)));

// ---------------- 12 appendix
c.push(H1("12. Appendix"));
c.push(H2("A. Roadmap as of October 10"));
c.push(table([700, 8660], ["#", "Item"], [
  ["1", "Redeploy the latest version and confirm the new post designs, fonts and sheet fix on a real phone."],
  ["2", "Stripe live mode and checkout test; upgrade hosting plan before charging."],
  ["3", "Upgrade the Google Cloud billing account before the free period ends (late October) so street view keeps working."],
  ["4", "Connect Google, Microsoft and Apple calendars with real keys; start the Gmail verification review."],
  ["5", "Admin tool to create or extend a trial for a named person."],
  ["6", "Progressive learning of how each agent operates (style, timing, templates)."],
  ["7", "Listing description writer; MLS and CRM integrations; Enterprise tier."],
  ["8", "Continue with Google sign-in (about a week after launch)."],
  ["9", "Items from the reviewer's feedback on this document."],
]));
c.push(H2("B. Decisions already made"));
[
  "Launch date October 20, 10:00 AM Eastern; quality over date.",
  "Domain milarealestate.app; waitlist at the root, app at app., admin at admin.",
  "Invite-only with an access code; 25 seats at launch; everyone else queued.",
  "Instagram and X first; TikTok reuses the same content.",
  "No push notifications at launch: an in-app inbox, a daily summary card, and email only for recent users.",
  "Texts and emails open in the agent's own apps (no sending from Mila's own number yet).",
  "Test accounts are unlimited and excluded from the trial pool.",
].forEach((t) => c.push(B(t)));
c.push(H2("C. Glossary"));
c.push(table([2400, 6960], ["Term", "Meaning"], [
  ["Credits", "The customer-facing unit. Each action costs a set number; real AI cost is tracked underneath."],
  ["Approval", "A held action (email, text, post, calendar change) waiting for the agent to confirm."],
  ["Trial pool", "The $20 total real-cost ceiling across all trial users."],
  ["Mila OS", "The internal admin dashboard (not visible to customers)."],
  ["Carousel", "A swipeable multi-image Instagram post (3 images)."],
  ["Story", "A single 9:16 image for Instagram stories and TikTok."],
  ["Lookup", "A paid call to a property-data or photo provider; limited per plan."],
]));
c.push(H2("D. What we are asking the reviewer to deliver"));
[
  "A ranked list of the features in Section 4 (keep, improve, cut).",
  "A corrected and completed version of the matrix in Section 10, using real hands-on access to the competitors where possible.",
  "The top five additions and the top five removals, with reasoning.",
  "A proposed first-run flow and home screen structure.",
  "A view on pricing and the trial.",
  "A list of risks to fix before October 20 and what can wait.",
].forEach((t) => c.push(B(t)));

const doc = new Document({
  creator: "Mila", title: "Mila: product, design and audit brief",
  styles: { default: { document: { run: { font: "Calibri", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 36, bold: true, font: "Calibri", color: ACC }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true, font: "Calibri", color: INK }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, font: "Calibri", color: ACC }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
    ] },
  numbering: { config: [
    { reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }, { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1000, hanging: 270 } } } }] },
    { reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
  ] },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1300, right: 1440, bottom: 1300, left: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run("Mila: product, design and audit brief  |  Confidential", { size: 16, color: SOFT })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run("Page ", { size: 16, color: SOFT }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: SOFT, font: "Calibri" })] })] }) },
    children: c,
  }],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync("Mila-Product-Audit-Brief.docx", b); console.log("ok", b.length); });
