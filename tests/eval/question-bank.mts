// Real-agent question bank. Every line is something an agent might type to Mila. The gate: none of them may fall to the generic "I'm not sure" menu or the "couldn't make that out" dead end.
// Run: node --import tsx tests/eval/question-bank.mts   (prints the lines Mila fumbled)
export const BANK: string[] = [
  // after an open house
  "My open house went good today anything I need to know for this week", "open house was great today", "just wrapped my open house", "the open house was slow today", "had 12 groups at the open house", "how did my open house go", "who came to my open house", "follow up with everyone from the open house",
  // calendar questions
  "What time does it start on Sunday?", "when is my next showing", "what do i have tomorrow", "what's my week look like", "am i free thursday afternoon", "do i have anything friday", "what time is my open house", "when is the inspection", "what's on for monday", "anything this weekend", "what time is the closing", "how's my day", "whats my schedule today", "what's next", "what do I have after lunch",
  // booking
  "Showing at 456 Oak Lane Sunday at 3 PM", "book a showing tomorrow at 2 with Dana", "put lunch with Mike on Friday at noon", "schedule an open house at 12 Elm St this Sunday 1 to 3", "remind me to call Priya tomorrow morning", "block off friday afternoon", "i'm out of town next week", "add a listing appointment thursday at 10", "set up a walkthrough monday 4pm", "dentist tuesday 9am",
  // changes
  "move my 2pm to 3", "push the showing to Saturday", "cancel the open house", "cancel tomorrow's lunch", "actually make it 4", "change the showing to the 15th", "reschedule my thursday call to friday", "swap the open house for a showing monday 1 to 3", "undo that", "never mind",
  // pronouns / follow-ups
  "move it to 5", "cancel it", "email them", "text her", "what about the other one", "yes", "no", "the one that happened today", "the first one", "the second one",
  // contacts and comms
  "add Sarah Lee, 301-555-0199, buyer", "who haven't I talked to in a while", "draft a follow up to Dana", "text Mike that I'm running late", "email everyone who came to the open house", "log a call with Priya she wants to tour thursday", "who are my hottest leads", "find my buyers under 600k", "what did I last say to Dana",
  // property
  "prep me for 123 Main St", "what's my listing at 12 Elm St worth", "is 12 Elm St ready to list", "what's missing on my listing", "any new listings for my buyers", "how's the market in Gaithersburg", "make a post for my listing", "make an instagram story for the open house", "write a caption for 12 Elm St", "new price 575k on 12 Elm St",
  // deals
  "what's coming up on my closing", "add a transaction for 12 Elm St closing Nov 15", "what deadlines do I have this week", "just closed on Oak Lane", "my pipeline value", "when is the inspection deadline",
  // general / smalltalk / help
  "hi", "thanks", "good morning", "what can you do", "help", "what should I do today", "what should I focus on", "give me my morning brief", "catch me up", "I'm overwhelmed", "that's wrong", "you got that wrong", "not what i asked", "why did you do that",
  // messy speech
  "uh can u move my thing tmrw to like 3ish", "hey so i got an open house sat 1-3 at 12 elm", "remind me ro call dana", "showing tmrw 2pm", "tell dana im running 10 min late", "lunch w/ mike fri noon", "oh and also cancel monday", "wait no thursday", "sorry i meant 4pm",
];
if (process.argv[1]?.endsWith("question-bank.mts")) {
  const { newAgent } = await import("../qa/harness.mts");
  const a = await newAgent({ now: new Date("2026-10-11T20:30:00Z"), tz: "America/New_York" });
  const bad: string[] = [];
  for (const q of BANK) {
    let r; try { r = await a.say(q); } catch (e) { bad.push(`${q}  =>  THREW ${(e as Error).message}`); continue; }
    const c = r.milaMessage.content;
    if (/not sure how to do that yet|couldn't make that out|I don't want to keep asking/i.test(c)) bad.push(`${q}  =>  ${c.slice(0, 90)}`);
    if (r.milaMessage.blocks?.some((b: any) => b.type === "approval") || a.log.length > 120) a.log.length = 0;
  }
  console.log(`${BANK.length} questions, ${bad.length} fumbled`); for (const b of bad) console.log(" - " + b);
  process.exit(0);
}
