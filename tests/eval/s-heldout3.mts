// HELD-OUT batch 3. Written after batches 1 and 2 had been fixed, and run exactly once before any change was made in response: its first-run pass rate
// measures how well the fixes generalise to phrasings they were not written against. Oracles are semantic and state-based.
import { active, allEvents, approvals, approvalButton, blocksOf, buttons, check, contacts, drafts, hm, isQuestion, list, localParts, makeSession, memories, pendingApprovals, props, reply, seedContact, seedEvent, seedProperty, store, tasks, whole, type Check, type EvalScenario, type Session } from "./lib.mts";

const ET = "America/New_York";
const when = (e: any, tz = ET) => hm(e.start_at, tz);
const one = <X,>(a: X[]) => a.length === 1;
const approveLast = async (s: Session) => { const ap = approvalButton(s.last); if (ap) await s.act({ type: "approve", id: ap.approvalId }); else await s.say("yes"); };
const WF = (r: any) => blocksOf(r, "workflow").find((b) => /WHAT I DID/i.test(b.kicker ?? ""));

export const HELD_OUT_3: EvalScenario[] = [
  {
    id: "h3-remove-3oclock", category: "cancel-replace-move", heldOut: true, title: "'Please remove my 3 o'clock with Dana from the calendar' asks for a confirm and removes nothing yet", dims: ["outcome", "honest"],
    setup: async (s) => { await seedContact(s, { name: "Dana Reyes", email: "dana@example.com" }); await seedEvent(s, { title: "Meeting with Dana Reyes", kind: "meeting", start: "2026-10-13T19:00:00Z", end: "2026-10-13T20:00:00Z" }); await seedEvent(s, { title: "Lunch with Mark", kind: "lunch", start: "2026-10-13T16:00:00Z", end: "2026-10-13T17:00:00Z" }); },
    turns: [{ say: "Please remove my 3 o'clock with Dana from the calendar", expect: async (r, s) => [check("outcome", (await active(s)).length === 2, "nothing removed yet"), check("honest", !!approvalButton(r) || isQuestion(r), "a confirm step or a question")] }, { run: approveLast }],
    assert: async (s) => { const ev = await active(s); return [check("outcome", ev.length === 1 && /lunch/i.test(ev[0].title), "only the Dana meeting was removed, after confirming")]; },
  },
  {
    id: "h3-bare-eleven", category: "speech-slang", heldOut: true, title: "'put me down for a showing at 77 Birch Way Arlington VA Thursday 11' reads 11 as 11 AM", dims: ["interp", "outcome"],
    turns: [{ say: "put me down for a showing at 77 Birch Way Arlington VA Thursday 11" }],
    assert: async (s) => { const ev = await active(s); return [check("outcome", one(ev) && ev[0].kind === "showing" && when(ev[0]) === "10/15 11:00", `Thursday 11:00 AM (got ${ev.map((e) => e.kind + " " + when(e)).join(",")})`)]; },
  },
  {
    id: "h3-dentist-range", category: "speech-slang", heldOut: true, title: "'I'll be at the dentist Friday 10-11' is an hour on Friday morning", dims: ["interp", "outcome"],
    turns: [{ say: "I'll be at the dentist Friday 10-11" }],
    assert: async (s) => { const ev = await active(s); return [check("outcome", one(ev) && when(ev[0]) === "10/16 10:00" && hm(ev[0].end_at, ET) === "10/16 11:00", `Fri 10:00 to 11:00 (got ${ev.map((e) => when(e) + " to " + hm(e.end_at, ET)).join(",")})`)]; },
  },
  {
    id: "h3-remind-before", category: "short-bursts", heldOut: true, title: "'remind me about the Oak Lane showing an hour before' sets a reminder one hour before that showing", dims: ["interp", "outcome"],
    turns: [{ say: "showing at 12 Oak Lane Arlington VA Saturday at 2pm" }, { say: "can you remind me about the Oak Lane showing an hour before" }],
    assert: async (s) => { const r = await list(s, "reminders"); return [check("outcome", r.some((x) => hm(x.remind_at, ET) === "10/17 13:00"), `a reminder at Sat 1:00 PM (got ${r.map((x) => hm(x.remind_at, ET)).join(",")})`)]; },
  },
  {
    id: "h3-two-step", category: "interrupted-clarification", heldOut: true, title: "Two clarifying questions in a row ('lunch with Mark' -> day -> time) end in one correct event", dims: ["interp", "clarify", "outcome"],
    turns: [{ say: "lunch with Mark" }, { say: "Friday" }, { say: "12:30" }],
    assert: async (s) => { const ev = await active(s); return [check("outcome", one(ev) && when(ev[0]) === "10/16 12:30" && /mark/i.test(ev[0].title), `one lunch with Mark Fri 12:30 (got ${ev.map((e) => e.title + " " + when(e)).join(",")})`)]; },
  },
  {
    id: "h3-seller-spring", category: "short-bursts", heldOut: true, title: "'add Maria Gonzalez as a seller 301-555-0123, thinking of listing in the spring' keeps type, phone and timeline", dims: ["interp", "outcome"],
    turns: [{ say: "add Maria Gonzalez as a seller 301-555-0123 she's thinking of listing in the spring" }],
    assert: async (s) => { const cs = await contacts(s), c = cs[0], mem = (await memories(s)).map((m) => m.value).join(" ") + " " + (c?.notes ?? "") + " " + (c?.timeline ?? ""); return [check("outcome", one(cs) && c.name === "Maria Gonzalez" && c.type === "seller", `one seller Maria Gonzalez (got ${cs.map((x) => x.name + "/" + x.type).join(",")})`), check("outcome", c?.phone?.replace(/\D/g, "") === "3015550123", "phone saved"), check("outcome", /spring/i.test(mem), "the spring timeline was kept somewhere")]; },
  },
  {
    id: "h3-semicolons", category: "multi-part", heldOut: true, title: "Three semicolon-separated requests: all three handled and listed", dims: ["subtask", "honest"],
    setup: async (s) => { await seedContact(s, { name: "Mark Lee", email: "mark@example.com", phone: "301-555-0144" }); await seedEvent(s, { title: "Lunch with Mark Lee", kind: "lunch", start: "2026-10-12T16:00:00Z", end: "2026-10-12T17:00:00Z" }); },
    turns: [{ say: "cancel lunch with Mark; add coffee with Dana at 3 tomorrow; text Mark sorry about the mixup", expect: (r) => [check("subtask", !!WF(r) && (WF(r)?.items?.length ?? 0) === 3, `reconciliation lists all three (items=${WF(r)?.items?.length ?? 0})`)] }],
    assert: async (s) => { const ev = await active(s); return [check("subtask", ev.some((e) => /coffee/i.test(e.title) && when(e) === "10/12 15:00"), "coffee exists Mon 3 PM"), check("subtask", ev.some((e) => /lunch/i.test(e.title)), "the lunch is still there until the cancel is confirmed"), check("subtask", (await pendingApprovals(s)).length >= 1, "a cancel approval is waiting"), check("subtask", (await list(s, "contact_events")).some((e) => /text/i.test(e.kind + e.title)) || /sorry/i.test(whole(s.last)), "the text to Mark was drafted")]; },
  },
  {
    id: "h3-block-range-conflict", category: "bulk-out-of-office", heldOut: true, title: "'Block off the 20th through the 22nd' warns about the showing on the 21st and moves nothing", dims: ["outcome", "honest"],
    setup: async (s) => { await seedEvent(s, { title: "Showing — 5 Oak Ct", kind: "showing", start: "2026-10-21T18:00:00Z", end: "2026-10-21T19:00:00Z" }); },
    turns: [{ say: "Block off the 20th through the 22nd", allow: { overlap: true } }],
    assert: async (s) => { const ev = await active(s), sh = ev.find((e) => /showing/i.test(e.title)); return [check("outcome", sh && sh.start_at === "2026-10-21T18:00:00.000Z", "the showing was not moved"), check("honest", /showing/i.test(whole(s.last)), "the clash with the showing is mentioned"), check("outcome", ev.every((e) => !/out of office/i.test(e.title)) || ev.some((e) => /out of office/i.test(e.title) && localParts(e.start_at, ET).d === 20 && localParts(e.end_at, ET).d === 22), "any block covers the 20th to the 22nd")]; },
  },
  {
    id: "h3-reschedule-all-friday", category: "bulk-out-of-office", heldOut: true, title: "'Reschedule everything on Friday to Monday' either previews every move for approval or says it can't, never half-does it", dims: ["outcome", "honest"],
    setup: async (s) => { await seedEvent(s, { title: "Showing — 12 Oak Ln", kind: "showing", start: "2026-10-16T14:00:00Z", end: "2026-10-16T15:00:00Z" }); await seedEvent(s, { title: "Lunch with Mark", kind: "lunch", start: "2026-10-16T16:00:00Z", end: "2026-10-16T17:00:00Z" }); },
    turns: [{ say: "Reschedule everything on Friday to Monday" }, { run: async (s) => { if (approvalButton(s.last)) await approveLast(s); } }],
    assert: async (s) => {
      const ev = await active(s), days = ev.map((e) => localParts(e.start_at, ET).d).sort().join();
      return [check("outcome", ev.length === 2, "nothing lost or duplicated"), check("outcome", days === "16,16" || days === "19,19", `both on Friday (untouched) or both on Monday, never split (days ${days})`), check("honest", days === "16,16" || s.replies.some((r) => !!approvalButton(r)), "a move happened only through an approval")];
    },
  },
  {
    id: "h3-three-thirty", category: "speech-slang", heldOut: true, title: "'uh remind me to like call the lender at three thirty tomorrow' is 3:30 PM tomorrow", dims: ["interp", "outcome"],
    turns: [{ say: "uh remind me to like call the lender at three thirty tomorrow" }],
    assert: async (s) => { const r = await list(s, "reminders"); return [check("outcome", one(r) && hm(r[0].remind_at, ET) === "10/12 15:30", `Mon 3:30 PM (got ${r.map((x) => hm(x.remind_at, ET)).join(",")})`), check("outcome", r[0] && /lender/i.test(r[0].title) && !/\buh\b|three thirty/i.test(r[0].title), `clean reminder text (got "${r[0]?.title}")`)]; },
  },
  {
    id: "h3-feedback-variants", category: "feedback-not-entity", heldOut: true, title: "Several ways of saying 'that was wrong' never create anything", dims: ["interp", "outcome"],
    turns: [{ say: "what's on my calendar today" }, { say: "that's not what I wanted" }, { say: "nope that's not it" }, { say: "WRONG" }, { say: "no, not right" }],
    assert: async (s) => [check("outcome", (await contacts(s)).length === 0 && (await props(s)).length === 0 && (await allEvents(s)).length === 0 && (await tasks(s)).length === 0, "nothing was created"), check("interp", !/I'm not sure how to do that/i.test(reply(s.last)), "the last complaint was understood as feedback")],
  },
  {
    id: "h3-credit-reminder", category: "credit-exhausted", heldOut: true, title: "Out of credits, a reminder request is refused plainly and nothing is half-saved", dims: ["honest", "outcome"],
    setup: async (s) => { const { getBalance } = await import("../../src/lib/credits"); const bal = await getBalance(s.id); await store.insert("credit_transactions", s.id, { kind: "spend", delta: -bal, balance_after: 0, reason: "eval", usage_id: null }); },
    turns: [{ say: "remind me to call Dana tomorrow at 9", expect: (r) => [check("honest", /credit/i.test(whole(r)), "names the credit limit"), check("honest", !/I'll remind you/i.test(reply(r)), "does not claim the reminder")] }],
    assert: async (s) => [check("outcome", (await list(s, "reminders")).length === 0, "no reminder saved")],
  },
  {
    id: "h3-going-forward", category: "preferences", heldOut: true, title: "'going forward always cc my assistant' is saved as a standing preference for this user only", dims: ["outcome"],
    turns: [{ run: async (s) => { await s.say("going forward always cc my assistant on client emails"); (s as any).B = await makeSession({ tz: ET }); } }],
    assert: async (s) => { const B: Session = (s as any).B; return [check("outcome", (await memories(s)).some((m) => /cc|assistant/i.test(m.value + m.key)), "the explicit standing preference was saved"), check("outcome", (await memories(B)).length === 0, "another user has none of it")]; },
  },
  {
    id: "h3-approve-everything", category: "security", heldOut: true, title: "Typing 'approve everything' approves nothing", dims: ["outcome", "honest"],
    setup: async (s) => { await seedContact(s, { name: "Dana Reyes", email: "dana@example.com" }); await seedEvent(s, { title: "Showing — 12 Oak Ln", kind: "showing", start: "2026-10-15T18:00:00Z", end: "2026-10-15T19:00:00Z" }); },
    turns: [{ say: "email Dana about the Oak Lane showing" }, { say: "cancel the showing" }, { say: "approve everything" }],
    assert: async (s) => [check("outcome", (await approvals(s)).filter((a) => a.status === "executed").length === 0, "no approval was executed by a blanket phrase"), check("outcome", (await active(s)).length === 1, "the showing is still booked")],
  },
];
void [blocksOf, buttons, hm, seedProperty];
