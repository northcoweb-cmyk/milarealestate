export interface Guide { slug: string; title: string; description: string; updated: string; intro: string; sections: { h: string; p?: string[]; ul?: string[] }[] }

const MILA_NOTE = "Mila is an AI operations manager for real estate agents. She drafts your follow-ups, posts and emails, keeps your calendar straight, and asks before anything goes out.";

export const GUIDES: Guide[] = [
  {
    slug: "open-house-checklist-for-agents",
    title: "The open house checklist: before, during and after",
    description: "A practical open house checklist for real estate agents: what to do the week before, the day of, and the follow-up that actually turns visitors into clients.",
    updated: "2026-10-12",
    intro: "A good open house is mostly preparation and follow-up. The two hours on Sunday are the smallest part. Use this checklist to make sure nothing slips.",
    sections: [
      { h: "One week before", ul: ["Confirm the date, start and end time, and the address on the listing, the sign, and every post.", "Walk the home and note what to fix, stage or declutter.", "Put the open house on your calendar with the right time zone, and block travel time before it.", "Draft the announcement post, story and email to your list so they go out early in the week.", "Print or prepare a sign-in sheet that asks for name, phone, email and whether they work with an agent."] },
      { h: "The day of", ul: ["Arrive 45 minutes early. Turn on every light, open blinds and set the temperature.", "Put signs out at the main turns, not just at the house.", "Greet every visitor and ask them to sign in. Ask what they are looking for.", "Have the price, key facts and a one-page flyer ready.", "Post a story during the open house, with the address and the end time."] },
      { h: "Within 24 hours", ul: ["Enter every sign-in into your contacts the same day, while you still remember who was who.", "Send a short personal thank-you to each visitor. Mention one thing they said.", "Tell the seller how many people came and what they said.", "Mark each visitor hot, warm or cold so you know who to call first."] },
      { h: "Within a week", ul: ["Follow up again with anyone who asked a question or is touring other homes.", "Invite the neighbors who stopped by to a private showing for friends and family.", "Post a thank-you or just-listed update with fresh photos."] },
      { h: "Where Mila fits", p: [MILA_NOTE + " Tell her “I have an open house at 12 Oak Lane Sunday 1 to 3” and she puts it on your calendar, drafts the announcement and the email, and reminds you to follow up afterward."] },
    ],
  },
  {
    slug: "listing-launch-checklist",
    title: "Listing launch checklist: from signed agreement to live",
    description: "What a real estate agent needs to do before a new listing goes live: details, photos, pricing, marketing and the first two weeks.",
    updated: "2026-10-12",
    intro: "A listing launch goes smoothly when the facts are right before anything is posted. Errors in the address, price or square footage get copied everywhere.",
    sections: [
      { h: "Get the facts right first", ul: ["Confirm the address, beds, baths, square footage, lot size, year built and HOA details from the seller and public records.", "Decide the list price with a recent comparable-sales review.", "Write down anything the seller wants disclosed or excluded."] },
      { h: "Photos and presentation", ul: ["Book a photographer and schedule it after cleaning and staging.", "Choose the main exterior and the best interior rooms first. The first few photos decide whether people keep scrolling.", "Make sure every photo is of this home. Photos from other listings on a link can be wrong."] },
      { h: "Marketing", ul: ["Prepare the announcement post, a story, and an email to your list.", "Plan the first open house and the first week of showings.", "Prepare a one-page flyer with the key facts and your contact details."] },
      { h: "The first two weeks", ul: ["Respond to every inquiry fast, ideally within minutes.", "Update the seller after each showing with feedback.", "Review activity after seven days. If showings are low, talk about price and presentation."] },
      { h: "Where Mila fits", p: [MILA_NOTE + " She can prep a property from an address, check what is missing, and draft the posts and emails for the launch for you to approve."] },
    ],
  },
  {
    slug: "ai-for-real-estate-agents",
    title: "AI for real estate agents: what it can do and what to check",
    description: "A plain explanation of how real estate agents can use AI for follow-ups, listing posts, scheduling and admin, and what a human should always verify.",
    updated: "2026-10-12",
    intro: "AI is useful for the repetitive writing and organizing that fills an agent's day. It is not a replacement for your judgment, and a few things always need a human check.",
    sections: [
      { h: "Good uses", ul: ["Drafting follow-up emails and texts in your voice.", "Writing listing and open house captions and posts.", "Turning a quick note into a calendar event or a reminder.", "Keeping track of who you have not talked to in a while.", "Preparing a one-page summary before a showing or meeting."] },
      { h: "Always check these yourself", ul: ["Prices, square footage and other facts that will be published.", "Anything that makes a promise to a client.", "Fair housing language. Do not describe who a home is “perfect for.” Describe the home.", "Photos, to make sure they show the right property."] },
      { h: "What to ask of any AI tool", ul: ["Does it ask before it sends anything?", "Does it show you what it is about to do?", "Does it keep your clients' information private and separate?", "Does it tell you when it is not sure instead of guessing?"] },
      { h: "Where Mila fits", p: [MILA_NOTE + " Mila never sends anything without your approval, and she asks which property or person you mean instead of guessing."] },
    ],
  },
  {
    slug: "real-estate-agent-daily-workflow",
    title: "A simple daily workflow for a busy real estate agent",
    description: "A realistic daily routine for real estate agents: what to do first, how to batch follow-ups, and how to keep your calendar from running you.",
    updated: "2026-10-12",
    intro: "Most agents are not short on hours. They are short on a system for the small things that pile up. This is a simple one.",
    sections: [
      { h: "Start of day (15 minutes)", ul: ["Look at today's calendar: showings, open houses, closings, inspections.", "Pick the three people you will contact first.", "Check deadlines on any deal in progress this week."] },
      { h: "Midday", ul: ["Batch your follow-ups into one block instead of answering each as it arrives.", "Log each call right after it ends: who, what they want, next step and date."] },
      { h: "End of day (10 minutes)", ul: ["Move anything unfinished to tomorrow, on purpose.", "Send the evening follow-ups from showings.", "Write down tomorrow's three first contacts."] },
      { h: "Weekly", ul: ["Review your pipeline: who is hot, who went quiet.", "Plan next week's open houses and the posts for them.", "Update sellers on activity."] },
      { h: "Where Mila fits", p: [MILA_NOTE + " Ask her “what's my week look like” or “who haven't I talked to in a while” to start."] },
    ],
  },
];
export const guide = (slug: string) => GUIDES.find((g) => g.slug === slug);
