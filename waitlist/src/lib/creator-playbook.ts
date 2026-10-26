// The scripts and outreach words for the creator program. Plain data, no code. A copy of this file lives in waitlist/src/lib so creators see the same scripts on their page: edit both together.

export interface Script {
  id: string; title: string; length: string; best: string; why: string;
  hooks: string[]; beats: { time: string; say: string; show: string }[]; caption: string; pinned: string;
}

/** What every video follows. Short on purpose: people remember three rules, not thirty. */
export const RULES = [
  "Open with the result or the problem in the first 2 seconds. Never with \"Hi guys\" or your name.",
  "Show the real app on your own phone. Type or say a real request and let the answer land on screen.",
  "Talk like you're showing a friend, not reading an ad. One idea per video. 20 to 35 seconds.",
  "Say it's sponsored: #milapartner and #sponsored (or #ad) in the caption, and tag Mila. Don't hide it, it builds trust.",
  "Never promise income, deals or results. Say what Mila does (reminders, calendar, drafting texts and emails) and that it asks before anything goes out.",
  "End with one simple line: \"7 days free, no card. Link in my bio.\"",
];

export const SCRIPTS: Script[] = [
  {
    id: "say-it", title: "Say it, it's on my calendar", length: "25 sec", best: "Agents. The easiest first video.",
    why: "Shows the whole product in one breath: a plain sentence becomes a calendar entry, a reminder and a text. Easy to follow without sound.",
    hooks: ["I stopped writing things down. Watch this.", "This is what I do after every showing now.", "POV: you have an assistant that never forgets."],
    beats: [
      { time: "0-3s", say: "Hook, to camera, phone in hand.", show: "Your face, then straight to the phone." },
      { time: "3-10s", say: "\"I just type what I'd normally forget.\"", show: "Type: \"Schedule a showing at 12 Oak Lane Saturday at 2.\" The Added card appears." },
      { time: "10-17s", say: "\"Then I ask it to remind me.\"", show: "Type: \"Remind me an hour before.\" It confirms the time and that it will email you." },
      { time: "17-24s", say: "\"And it writes the text to my client.\"", show: "Type: \"Text Dana to confirm.\" The text card appears with Open in Messages." },
      { time: "24-30s", say: "\"7 days free, no card. Link in my bio.\"", show: "Back to your face. Smile." },
    ],
    caption: "I forget everything between showings. This fixes it. 7 days free, link in bio. #milapartner #sponsored #realestateagent",
    pinned: "Free for 7 days, no card needed. Link in my bio. Ask me anything about it!",
  },
  {
    id: "net-sheet", title: "A seller net sheet in 10 seconds", length: "20 sec", best: "Agents who list. The most visual one: the number counts up on screen.",
    why: "A real task agents dread. The animated card makes people stop and rewatch.",
    hooks: ["A seller asked what they'd walk away with. Watch how long this takes.", "Stop building net sheets in a spreadsheet.", "10 seconds. No spreadsheet."],
    beats: [
      { time: "0-3s", say: "Hook, with the clock or stopwatch visible.", show: "Stopwatch on screen, or say \"timing myself\"." },
      { time: "3-8s", say: "\"I just type the numbers.\"", show: "Type: \"Net sheet: $650,000 sale, $380,000 payoff, 5.5% commission, 1% taxes.\"" },
      { time: "8-15s", say: "\"And that's what they'd net.\"", show: "The card counts up to the final number. Hold on it for two seconds." },
      { time: "15-22s", say: "\"Now they can decide. 7 days free, link in bio.\"", show: "Your face." },
    ],
    caption: "Net sheet in 10 seconds. 7 days free, link in bio. (Estimates only, always check the settlement statement.) #milapartner #sponsored #listingagent",
    pinned: "It's an estimate, the title company has the final number. Free for 7 days, link in my bio!",
  },
  {
    id: "follow-up", title: "The follow-up text I always forgot", length: "30 sec", best: "New agents and anyone who says they're bad at follow-up.",
    why: "A feeling everyone has. Story first, product second.",
    hooks: ["The reason I lose leads is one text I never send.", "I was bad at follow-up. This changed that.", "Every showing ends with a text I used to forget."],
    beats: [
      { time: "0-5s", say: "The honest version: \"After a showing, I'd forget to follow up. Two days later it's awkward.\"", show: "Your face, relaxed, a bit self-aware." },
      { time: "5-14s", say: "\"Now I tell Mila and it's written.\"", show: "Type: \"Draft a thank-you text to Dana for the showing.\" The card appears." },
      { time: "14-22s", say: "\"I make it warmer if I want.\"", show: "Type: \"Make it warmer.\" The old one is crossed out, the new one appears." },
      { time: "22-30s", say: "\"I tap send. It never sends without me. 7 days free in my bio.\"", show: "Tap Open in Messages." },
    ],
    caption: "Follow-up used to be my weak spot. 7 days free, link in bio. #milapartner #sponsored #realestatetips",
    pinned: "To be clear: it drafts, I tap send. It never texts anyone on its own. Free 7 days, link in bio.",
  },
  {
    id: "sunday", title: "My Sunday night planning, in 30 seconds", length: "30 sec", best: "Agents and busy people. Great for a talking-head plus screen.",
    why: "Relatable pain (Sunday dread) with a clear before and after.",
    hooks: ["Sunday night used to cost me an hour. Now it takes 30 seconds.", "How I plan my whole week from my couch.", "The two questions I ask my AI every Sunday."],
    beats: [
      { time: "0-4s", say: "Hook, on the couch, phone up.", show: "Your face, cozy." },
      { time: "4-13s", say: "\"First: how does my week look?\"", show: "Type it. The week appears with the days and the busy ones flagged." },
      { time: "13-22s", say: "\"Second: who should I follow up with?\"", show: "Type it. The follow-up list appears." },
      { time: "22-30s", say: "\"That's my Sunday. 7 days free, link in bio.\"", show: "Close the app. Phone down." },
    ],
    caption: "Sunday planning in 30 seconds. 7 days free, link in bio. #milapartner #sponsored #productivity #realestate",
    pinned: "I ask it these two things every Sunday. Free for 7 days, no card: link in my bio.",
  },
  {
    id: "open-house", title: "An open house from one sentence", length: "30 sec", best: "Agents who hold opens. Shows depth.",
    why: "Shows the product doing several jobs at once (calendar, checklist, post) from one request.",
    hooks: ["One sentence set up my entire open house.", "I used to spend an hour prepping an open house. Watch.", "Open house prep, but lazy."],
    beats: [
      { time: "0-4s", say: "Hook, with a sign or keys in hand.", show: "Your face, the prop." },
      { time: "4-14s", say: "\"I just tell it where and when.\"", show: "Type: \"Set up an open house at 14 Elm Street Saturday 1 to 3.\" The event and checklist appear." },
      { time: "14-24s", say: "\"And it makes the post, too.\"", show: "Type: \"Make an open house post.\" The draft post appears. Say you approve before anything posts." },
      { time: "24-30s", say: "\"7 days free in my bio.\"", show: "Your face." },
    ],
    caption: "One sentence = open house on my calendar + a post draft. 7 days free, link in bio. #milapartner #sponsored #openhouse",
    pinned: "It drafts the post, I approve it first. Free for 7 days, link in my bio!",
  },
  {
    id: "what-if", title: "\"What if rates drop?\"", length: "20 sec", best: "Buyer's agents and loan officers. Another number-card video.",
    why: "A question every buyer asks. The answer on screen is instantly useful.",
    hooks: ["A buyer asked what a lower rate does to their payment. I typed it.", "Mortgage math without a calculator tab.", "What 0.75% actually changes on a $520k home."],
    beats: [
      { time: "0-3s", say: "Hook, quick.", show: "Your face." },
      { time: "3-10s", say: "\"I type the price and the rate.\"", show: "Type: \"Payment on $520k, 10% down at 7%.\" The card counts up." },
      { time: "10-17s", say: "\"Then I just ask what if it drops.\"", show: "Type: \"What if rates drop to 6.25%?\" The new payment and the difference appear." },
      { time: "17-22s", say: "\"7 days free, link in bio.\"", show: "Your face." },
    ],
    caption: "Rate what-ifs in seconds. (Estimates, taxes and insurance extra.) 7 days free, link in bio. #milapartner #sponsored #homebuyers",
    pinned: "These are estimates. Taxes, insurance and HOA come on top. Free for 7 days, link in bio.",
  },
  {
    id: "honest-review", title: "Honest review: an AI assistant for agents", length: "35 sec", best: "Creators who aren't agents (productivity, tech, side-hustle). Credible and low pressure.",
    why: "Reviews convert because they sound honest. Include one real limit.",
    hooks: ["I tested an AI assistant made for real estate agents. Here's the honest version.", "Does an AI actually save a real estate agent time? I tried.", "What I liked, what I didn't."],
    beats: [
      { time: "0-5s", say: "Hook plus one-line context: \"This is Mila, built just for agents.\"", show: "Your face, then the app's home screen." },
      { time: "5-16s", say: "What you liked: \"It understood plain sentences and put things on my calendar.\"", show: "Do one real request live." },
      { time: "16-26s", say: "One honest limit: \"It drafts texts and emails, it doesn't send them for you. I tap send. I like that, but know it.\"", show: "Show the draft and the Open in Messages button." },
      { time: "26-35s", say: "\"7 days free, no card, so try it yourself. Link in bio.\"", show: "Your face." },
    ],
    caption: "Honest take on an AI built for real estate agents. 7 days free, link in bio. #milapartner #sponsored #aitools",
    pinned: "Not an agent yourself? It's built for them, so I tested it the way they'd use it. Free 7 days in my bio.",
  },
  {
    id: "day-in-life", title: "A day with an AI chief of staff", length: "45 sec", best: "Creators with a day-in-the-life style. Longer, story format.",
    why: "Shows the emails, the reminder and the drafts landing through a real day.",
    hooks: ["A day in my life, but my assistant is an app.", "Morning email, reminder, text, post: all handled.", "What an AI assistant actually did for me today."],
    beats: [
      { time: "0-6s", say: "Hook over a morning shot (coffee, car).", show: "Your day." },
      { time: "6-16s", say: "\"My morning email lists everything on for today.\"", show: "Show the summary email on your phone." },
      { time: "16-28s", say: "\"I asked it to draft a text and a post.\"", show: "Two quick screen recordings." },
      { time: "28-38s", say: "\"The reminder emailed me before my showing.\"", show: "Show the reminder email arriving." },
      { time: "38-45s", say: "\"7 days free, link in bio.\"", show: "Your face." },
    ],
    caption: "My day with an AI chief of staff. 7 days free, link in bio. #milapartner #sponsored #dayinmylife #realestate",
    pinned: "Everything it drafts waits for my OK. Free for 7 days, link in bio.",
  },
  {
    id: "comment-reply", title: "Reply to a comment: \"does it text for you?\"", length: "15 sec", best: "Anyone, after they've posted one video. Builds trust.",
    why: "Answering the obvious question honestly makes people believe the rest.",
    hooks: ["Replying to a question I get a lot.", "No, it doesn't send anything on its own. Here's what it does.", "Yes, but here's the catch."],
    beats: [
      { time: "0-4s", say: "Use TikTok's reply-with-video on the comment.", show: "The comment sticker." },
      { time: "4-12s", say: "\"It writes the text and I tap send. It never sends without me.\"", show: "Show the draft and the Open in Messages button." },
      { time: "12-15s", say: "\"7 days free in my bio.\"", show: "Your face." },
    ],
    caption: "It drafts, I send. Always. 7 days free, link in bio. #milapartner #sponsored",
    pinned: "Free for 7 days, no card. Link in my bio!",
  },
];

export const HOOK_BANK = [
  "I stopped writing things down.", "This took me 10 seconds.", "Nobody tells new agents this.", "I was bad at follow-up. Then this.",
  "POV: your assistant never forgets.", "Stop doing this in a spreadsheet.", "The one thing I do after every showing.", "Here's what it did in 20 seconds.",
];

/** For Sarah: how to pick people and what to say. */
export const VETTING = {
  good: [
    "1,000 to 100,000 followers. Bigger isn't better: engaged beats huge.",
    "Real comments from real people, not just emojis. Their last 5 videos get roughly 10% or more of their follower count in views.",
    "Posts about real estate, new-agent life, sales, productivity or small-business tools. Their audience should be agents.",
    "Account is at least 6 months old and posts regularly.",
    "Speaks to the camera in their own voice. Looks like someone you'd trust.",
  ],
  red: [
    "Followers jumped by thousands in a few days, or comments are all the same emojis and phrases.",
    "Their videos are reposts or stock clips, not their own.",
    "They ask for money upfront, or only want the free month and ask nothing about the product.",
    "Another person is already on the list with the same handle or the same email.",
    "They sign up but never open Mila (Mila OS shows messages sent: zero).",
    "The video link isn't on their own account, or the account in the link doesn't match their handle.",
  ],
};

export const OUTREACH: { id: string; title: string; when: string; text: string }[] = [
  { id: "dm1", title: "First message (DM)", when: "First time reaching out", text: "Hey [name]! I'm Sarah with Mila, an AI assistant made for real estate agents (calendar, follow-ups, texts, posts). I love your content. We're inviting a small group of creators to try it free for 14 days and post 3 short videos about it. If you do, you get a free month on us (and a shot at becoming a paid partner). Want the details?" },
  { id: "dm2", title: "Follow-up (3 days later)", when: "No reply after 3 days", text: "Hey [name], quick follow-up in case my message got buried. No pressure at all. It's a real tool, not a script: you just use Mila for a couple of weeks and show it. Happy to answer questions, or send a 20-second video of what it does." },
  { id: "dm3", title: "When they say yes", when: "They're interested", text: "Amazing! I just need your email (for your Mila login) and your handle. You'll get a login, a private page with ideas and scripts, and 14 days to post 3 videos. Add #milapartner and #sponsored so it's clearly marked. You get a free month when all 3 are approved." },
  { id: "dm4", title: "They went quiet after getting access", when: "Day 5 to 7, no videos", text: "Hey [name], checking in. Did you get a chance to try Mila yet? Your page has ready-to-use scripts (the \"say it, it's on my calendar\" one takes 5 minutes to film). Your window closes on [date]. Anything I can help with?" },
  { id: "partner", title: "Becoming a partner", when: "After a great first round (Ryan decides)", text: "Your videos did great and you actually use Mila, which comes through. We'd love to make you a partner: Mila stays free while you post a couple of videos a month, plus you earn a percentage of every paid sign-up from your link. Want in?" },
];
