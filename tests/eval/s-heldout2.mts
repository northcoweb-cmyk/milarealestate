// HELD-OUT batch 2. Written AFTER the first round of fixes and run exactly once before anything was changed in response, so its first-run pass rate
// is an honest generalisation measure for the fixes made against batch 1 and the tuned set. Oracles are semantic and state-based.
import { active, allEvents, approvals, approvalButton, blocksOf, buttons, check, contacts, drafts, hm, isQuestion, list, localParts, makeSession, memories, pendingApprovals, props, reply, seedContact, seedEvent, seedProperty, store, tasks, whole, type Check, type EvalScenario, type Session } from "./lib.mts";

const NOW = "2026-10-11T14:00:00Z"; // Sunday 10:00 ET
const ET = "America/New_York";
const when = (e: any, tz = ET) => hm(e.start_at, tz);
const one = <X,>(a: X[]) => a.length === 1;
const approveLast = async (s: Session) => { const ap = approvalButton(s.last); if (ap) await s.act({ type: "approve", id: ap.approvalId }); else await s.say("yes"); };
const WF = (r: any) => blocksOf(r, "workflow").find((b) => /WHAT I DID/i.test(b.kicker ?? ""));

export const HELD_OUT_2: EvalScenario[] = [
  {
    id: "h2-cancel-the-2pm", category: "entity-ambiguity", heldOut: true, title: "'Cancel the 2pm' with a 2pm on two different days asks which", dims: ["clarify", "outcome"],
    setup: async (s) => { await seedEvent(s, { title: "Showing — 12 Oak Ln", kind: "showing", start: "2026-10-13T18:00:00Z", end: "2026-10-13T19:00:00Z" }); await seedEvent(s, { title: "Call with the lender", kind: "call", start: "2026-10-15T18:00:00Z", end: "2026-10-15T18:30:00Z" }); },
    turns: [{ say: "cancel the 2pm", expect: (r) => check("clarify", isQuestion(r), "asks which 2 PM") }],
    assert: async (s) => [check("outcome", (await active(s)).length === 2, "both still booked"), check("outcome", (await pendingApprovals(s)).length === 0, "no approval for a guessed event")],
  },
  {
    id: "h2-reschedule-lunch", category: "cancel-replace-move", heldOut: true, title: "'reschedule my lunch w/ Mark to thurs same time'", dims: ["interp", "outcome"],
    setup: async (s) => { await seedEvent(s, { title: "Lunch with Mark", kind: "lunch", start: "2026-10-13T16:30:00Z", end: "2026-10-13T17:30:00Z" }); },
    turns: [{ say: "reschedule my lunch w/ Mark to thurs same time" }, { run: async (s) => { if (approvalButton(s.last)) await approveLast(s); } }],
    assert: async (s) => { const ev = await active(s); return [check("outcome", one(ev) && when(ev[0]) === "10/15 12:30", `Thursday 12:30 (got ${ev.map((e) => when(e)).join(",")})`)]; },
  },
  {
    id: "h2-push-everything", category: "bulk-out-of-office", heldOut: true, title: "'Push everything on Monday back an hour' never moves anything silently", dims: ["outcome", "honest"],
    setup: async (s) => { await seedEvent(s, { title: "Showing — 12 Oak Ln", kind: "showing", start: "2026-10-12T14:00:00Z", end: "2026-10-12T15:00:00Z" }); await seedEvent(s, { title: "Lunch with Mark", kind: "lunch", start: "2026-10-12T16:00:00Z", end: "2026-10-12T17:00:00Z" }); await seedEvent(s, { title: "Closing — 9 Elm St", kind: "closing", start: "2026-10-12T19:00:00Z", end: "2026-10-12T20:00:00Z" }); },
    turns: [{ say: "push everything on Monday back an hour" }, { run: async (s) => { if (approvalButton(s.last)) await approveLast(s); } }],
    assert: async (s) => {
      const ev = await active(s), starts = ev.map((e) => e.start_at).sort().join();
      const orig = ["2026-10-12T14:00:00.000Z", "2026-10-12T16:00:00.000Z", "2026-10-12T19:00:00.000Z"].join();
      const shifted = ["2026-10-12T15:00:00.000Z", "2026-10-12T17:00:00.000Z", "2026-10-12T20:00:00.000Z"].join();
      return [check("outcome", ev.length === 3, "no event lost or duplicated"), check("outcome", starts === orig || starts === shifted, `either all three moved by exactly an hour (after a preview) or none moved (got ${starts})`), check("honest", starts === shifted ? (s.replies.some((r) => !!approvalButton(r))) : /can't|not sure|which|one at a time|couldn't|haven't/i.test(whole(s.last)) || s.replies.some((r) => !!approvalButton(r)), "a shift of everything went through an approval, or Mila said she can't do it")];
    },
  },
  {
    id: "h2-tell-priya", category: "entity-ambiguity", heldOut: true, title: "'Tell Priya the open house moved to 4' with two Priyas asks", dims: ["clarify", "interp"],
    setup: async (s) => { await seedContact(s, { name: "Priya Shah", email: "priya.shah@example.com", phone: "301-555-0101" }); await seedContact(s, { name: "Priya Patel", email: "priya.p@example.com", phone: "301-555-0102" }); },
    turns: [{ say: "tell Priya the open house moved to 4", expect: (r) => check("clarify", isQuestion(r), "asks which Priya") }],
    assert: async (s) => [check("interp", (await drafts(s)).length === 0 && !(await list(s, "contact_events")).length, "nothing written for a guessed Priya")],
  },
  {
    id: "h2-new-buyer-fields", category: "short-bursts", heldOut: true, title: "'New buyer: Rob Stein, email, phone, budget 500k, wants 2 bed in Silver Spring' fills each field", dims: ["interp", "outcome"],
    turns: [{ say: "new buyer: Rob Stein, rob@example.com, 240-555-0177, budget 500k, wants 2 bed in Silver Spring" }],
    assert: async (s) => { const c = (await contacts(s))[0]; return [check("outcome", c?.name === "Rob Stein" && c.email === "rob@example.com" && c.phone?.replace(/\D/g, "") === "2405550177", "name, email and phone"), check("outcome", c?.budget_max === 500000, `budget 500k (got ${c?.budget_max})`), check("outcome", c?.preferences?.beds_min === 2 && /silver spring/i.test(c?.location ?? ""), `2 bed in Silver Spring (got ${c?.preferences?.beds_min}, ${c?.location})`)]; },
  },
  {
    id: "h2-dana-called", category: "call-summaries", heldOut: true, title: "'dana called, wants to see 12 oak lane saturday' is a logged call and follow-up, not an appointment", dims: ["interp", "outcome"],
    setup: async (s) => { await seedContact(s, { name: "Dana Reyes", email: "dana@example.com" }); },
    turns: [{ say: "dana called, wants to see 12 oak lane saturday" }],
    assert: async (s) => { const d = (await contacts(s))[0]; return [check("outcome", (await allEvents(s)).length === 0, "no appointment was invented without a time"), check("outcome", (await list(s, "contact_events")).some((e) => e.contact_id === d.id), "the call is in Dana's history"), check("outcome", (await tasks(s)).some((t) => /dana/i.test(t.title + (t.subtitle ?? "")) && t.kind !== "approval"), "a follow-up task exists"), check("outcome", (await contacts(s)).length === 1, "no duplicate Dana")]; },
  },
  {
    id: "h2-nvm-pending", category: "interrupted-clarification", heldOut: true, title: "'nvm' to a clarifying question books nothing and leaves nothing hanging", dims: ["outcome", "clarify"],
    turns: [{ say: "showing at 12 Oak Lane Arlington VA Saturday" }, { say: "nvm" }, { say: "3pm" }],
    assert: async (s) => [check("outcome", (await active(s)).length === 0 || (await active(s)).every((e) => !/oak/i.test(e.title)), `a stray "3pm" after "nvm" does not resurrect the Oak Lane showing (events: ${(await active(s)).map((e) => e.title).join(";")})`)],
  },
  {
    id: "h2-scrap-email", category: "compose-no-send", heldOut: true, title: "'scrap that' after an email draft sends nothing and claims nothing", dims: ["honest", "outcome"],
    setup: async (s) => { await seedContact(s, { name: "Dana Reyes", email: "dana@example.com" }); },
    turns: [{ say: "email Dana about the Oak Street open house" }, { say: "scrap that", expect: (r) => check("honest", !/\bsent\b/i.test(reply(r)), "no sent claim") }, { say: "did it go out?", expect: (r) => check("honest", /not|n't|nothing|no/i.test(reply(r)), `says no (got: ${reply(r).slice(0, 100)})`) }],
    assert: async (s) => [check("honest", (await drafts(s)).every((d) => d.status !== "sent"), "no draft sent"), check("outcome", !(await approvals(s)).some((a) => a.status === "executed"), "no approval was executed")],
  },
  {
    id: "h2-zones", category: "time-anchors", heldOut: true, title: "The same words in three time zones give the same local time", dims: ["interp", "outcome"],
    turns: [{
      run: async (s) => {
        const out: Record<string, string> = {};
        for (const [tz, now] of [["America/Denver", "2026-10-12T15:00:00Z"], ["America/Los_Angeles", "2026-10-12T15:00:00Z"], ["America/Chicago", "2026-10-12T15:00:00Z"]] as const) {
          const z = await makeSession({ tz, now }); await z.say("coffee with Dana tomorrow at 8am");
          const ev = await active(z); out[tz] = ev[0] ? hm(ev[0].start_at, tz) : "none";
        }
        (s as any).zones = out;
      },
    }],
    assert: async (s) => { const z = (s as any).zones as Record<string, string>; return Object.entries(z).map(([tz, v]) => check("outcome", v === "10/13 8:00", `${tz}: tomorrow 8:00 local (got ${v})`)); },
  },
  {
    id: "h2-typo-schedule", category: "speech-slang", heldOut: true, title: "Typos in the verb and noun still book the showing", dims: ["interp", "outcome"],
    turns: [{ say: "scheduel a shwoing at 5 elm st arlington va tmrw 2pm" }],
    assert: async (s) => { const ev = await active(s); return [check("outcome", one(ev) && ev[0].kind === "showing" && when(ev[0]) === "10/12 14:00", `showing Mon 2 PM (got ${ev.map((e) => e.kind + " " + when(e)).join(",")})`)]; },
  },
  {
    id: "h2-at-sign-noon", category: "speech-slang", heldOut: true, title: "'lunch w/ the Kims fri @ noon'", dims: ["interp", "outcome"],
    turns: [{ say: "lunch w/ the Kims fri @ noon" }],
    assert: async (s) => { const ev = await active(s); return [check("outcome", one(ev) && when(ev[0]) === "10/16 12:00" && /kim/i.test(ev[0].title), `lunch with the Kims Fri 12:00 (got ${ev.map((e) => e.title + " " + when(e)).join(",")})`)]; },
  },
  {
    id: "h2-um-reminder", category: "speech-slang", heldOut: true, title: "Dictated filler: 'um so like uh remind me to uh call dana tomorrow at nine'", dims: ["interp", "outcome"],
    turns: [{ say: "um so like uh remind me to uh call dana tomorrow at nine" }],
    assert: async (s) => { const r = await list(s, "reminders"); return [check("outcome", one(r) && hm(r[0].remind_at, ET) === "10/12 9:00", `one reminder Mon 9:00 (got ${r.map((x) => x.title + " " + hm(x.remind_at, ET)).join(";")})`), check("outcome", r[0] && /call/i.test(r[0].title) && !/^um\b|\buh\b/i.test(r[0].title), `the reminder text is clean (got "${r[0]?.title}")`)]; },
  },
  {
    id: "h2-nine-thirty", category: "speech-slang", heldOut: true, title: "'remind me at nine thirty tomorrow to call the lender'", dims: ["interp", "outcome"],
    turns: [{ say: "remind me at nine thirty tomorrow to call the lender" }],
    assert: async (s) => { const r = await list(s, "reminders"); return [check("outcome", one(r) && hm(r[0].remind_at, ET) === "10/12 9:30", `Mon 9:30 (got ${r.map((x) => hm(x.remind_at, ET)).join(";")})`)]; },
  },
  {
    id: "h2-parked-address", category: "interrupted-clarification", heldOut: true, title: "A missing-address question survives an unrelated request and is finished by a typed address", dims: ["interp", "outcome", "clarify"],
    turns: [{ say: "open house Saturday 1-3", noAutoCity: true }, { say: "new buyer Ned Fox ned@example.com" }, { say: "12 Oak Lane Arlington VA" }],
    assert: async (s) => { const ev = await active(s), cs = await contacts(s); return [check("outcome", cs.length === 1 && cs[0].name === "Ned Fox", "the interrupting contact was created once"), check("outcome", ev.some((e) => e.kind === "open_house" && /oak/i.test(e.title) && when(e) === "10/17 13:00"), `the open house was finished at 12 Oak Lane (events: ${ev.map((e) => e.title + " " + when(e)).join(";")})`)]; },
  },
  {
    id: "h2-thankyou-draft-only", category: "draft-only", heldOut: true, title: "'Write the Kims a thank-you. Do not schedule anything.' makes a draft and no event", dims: ["outcome", "draft"],
    setup: async (s) => { await seedContact(s, { name: "Ann Kim", email: "kim@example.com" }); },
    turns: [{ say: "write the Kims a thank you for coming to the open house on Saturday at 1pm. Do not schedule anything." }],
    assert: async (s) => [check("outcome", (await allEvents(s)).length === 0, "no event created"), check("draft", (await drafts(s)).length === 1 || /which|who/i.test(reply(s.last)), "one draft or a question about who"), check("outcome", (await drafts(s)).every((d) => d.status !== "sent"), "nothing sent")],
  },
  {
    id: "h2-move-and-email", category: "multi-part", heldOut: true, title: "'Move the showing to 4 and email Dana about it' does both and lists both", dims: ["subtask", "honest"],
    setup: async (s) => { await seedContact(s, { name: "Dana Reyes", email: "dana@example.com" }); await seedEvent(s, { title: "Showing with Dana Reyes — 12 Oak Ln", kind: "showing", start: "2026-10-14T18:00:00Z", end: "2026-10-14T18:45:00Z" }); },
    turns: [{ say: "Move the showing to 4 and email Dana about it", expect: (r) => check("subtask", !!WF(r) && (WF(r)?.items?.length ?? 0) >= 2, "WHAT I DID lists both parts") }],
    assert: async (s) => { const ev = await active(s); return [check("subtask", one(ev) && when(ev[0]) === "10/14 16:00", `moved to 4 PM (got ${ev.map((e) => when(e)).join(",")})`), check("subtask", (await drafts(s)).length >= 1, "an email draft exists")]; },
  },
  {
    id: "h2-caption-no-event", category: "content-requests", heldOut: true, title: "A caption for 'my open house tomorrow' with none booked asks or says so, and invents no details", dims: ["factual", "honest"],
    turns: [{ say: "write a caption for my open house tomorrow" }],
    assert: async (s) => { const posts = await list(s, "social_posts"), t = posts.map((p) => p.caption).join(" "); return [check("factual", posts.length === 0 || !/\b\d{1,2}\s?(?:am|pm)\b|\$\d/i.test(t), `no invented time or price (${t.slice(0, 80)})`), check("honest", posts.length > 0 || isQuestion(s.last) || /don't see|no open house|which/i.test(reply(s.last)), "asks which one or says none is booked")]; },
  },
  {
    id: "h2-unknown-price", category: "property-facts", heldOut: true, title: "'what's the price on 12 oak lane' with no price saved says it doesn't know instead of inventing", dims: ["factual", "honest"],
    setup: async (s) => { await seedProperty(s, { address: "12 Oak Lane", city: "Arlington", state: "VA" }); },
    turns: [{ say: "what's the price on 12 oak lane" }],
    assert: async (s) => [check("factual", !/\$\s?\d{3}/.test(reply(s.last)), `no invented price (${reply(s.last).slice(0, 100)})`), check("honest", /don't|not|no price|haven't|missing|unknown|tell me/i.test(reply(s.last)), "says the price is not on file")],
  },
  {
    id: "h2-pref-crossuser", category: "preferences", heldOut: true, title: "'I prefer texts over calls' belongs to the agent who said it", dims: ["outcome"],
    turns: [{ run: async (s) => { await s.say("I prefer texts over calls with clients"); (s as any).B = await makeSession({ now: NOW, tz: ET }); await (s as any).B.say("what do you know about how I work?"); } }],
    assert: async (s) => { const B: Session = (s as any).B; return [check("outcome", (await memories(s)).some((m) => /text/i.test(m.value)), "saved for the user who said it"), check("outcome", (await memories(B)).length === 0 && !/prefer texts/i.test(whole(B.last)), "not visible to another user")]; },
  },
  {
    id: "h2-two-oaks", category: "entity-ambiguity", heldOut: true, title: "'Cancel Oak' with two Oak open houses asks which", dims: ["clarify", "outcome"],
    setup: async (s) => { await seedEvent(s, { title: "Open House — 100 Oak Street", kind: "open_house", start: "2026-10-17T17:00:00Z", end: "2026-10-17T19:00:00Z", location: "100 Oak Street" }); await seedEvent(s, { title: "Open House — 55 Oak Court", kind: "open_house", start: "2026-10-18T17:00:00Z", end: "2026-10-18T19:00:00Z", location: "55 Oak Court" }); },
    turns: [{ say: "cancel the Oak open house", expect: (r) => check("clarify", isQuestion(r), "asks which Oak") }],
    assert: async (s) => [check("outcome", (await active(s)).length === 2 && (await pendingApprovals(s)).length === 0, "both remain, no approval for a guess")],
  },
  {
    id: "h2-foreign-conversation", category: "security", heldOut: true, title: "A conversation id from another user is not honoured and leaks nothing", dims: ["outcome", "honest"],
    turns: [{
      run: async (s) => {
        const V = await makeSession({ now: NOW, tz: ET }); (s as any).V = V;
        await V.say("new buyer Victor Hale victor@example.com");
        const vConv = (await list(V, "conversations"))[0];
        const { handleTurn } = await import("../../src/lib/agent/engine");
        (s as any).r = await handleTurn(s.a.profile, { message: "what did I just say? list my contacts", conversationId: vConv.id });
        (s as any).vConv = vConv;
      },
    }],
    assert: async (s) => {
      const r = (s as any).r, V: Session = (s as any).V;
      const vMsgs = (await store.list("messages", V.id)).filter((m: any) => m.conversation_id === (s as any).vConv.id);
      const myMsgs = (await store.list("messages", s.id));
      return [check("outcome", !/victor/i.test(JSON.stringify(r.milaMessage)), "no victim data in the reply"), check("outcome", vMsgs.every((m: any) => !/what did I just say/i.test(m.content)), "nothing was written into the victim's conversation"), check("outcome", myMsgs.some((m: any) => /what did I just say/i.test(m.content)), "the message landed in the sender's own conversation")];
    },
  },
  {
    id: "h2-double-approve", category: "edits-after-approval", heldOut: true, title: "Tapping Confirm twice cancels once and says so the second time", dims: ["outcome", "honest"],
    setup: async (s) => { await seedEvent(s, { title: "Showing — 12 Oak Ln", kind: "showing", start: "2026-10-15T18:00:00Z", end: "2026-10-15T19:00:00Z" }); await seedEvent(s, { title: "Lunch with Mark", kind: "lunch", start: "2026-10-16T16:00:00Z", end: "2026-10-16T17:00:00Z" }); },
    turns: [{ say: "cancel the showing" }, { act: (s) => ({ type: "approve", id: approvalButton(s.last)?.approvalId }) }, { act: (s) => ({ type: "approve", id: approvalButton(s.replies.at(-2))?.approvalId }), expect: (r) => check("honest", /already/i.test(reply(r)), `second tap says it was already handled (got: ${reply(r).slice(0, 80)})`) }],
    assert: async (s) => [check("outcome", (await active(s)).length === 1 && /lunch/i.test((await active(s))[0].title), "only the showing was canceled, once")],
  },
];
void [localParts, props];
