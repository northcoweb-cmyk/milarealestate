// TUNED scenarios (part 3): defects found by probing the agent after the first rounds; kept as regression coverage.
import { active, allEvents, approvals, approvalButton, blocksOf, buttons, check, contacts, drafts, hm, isQuestion, list, localParts, makeSession, memories, pendingApprovals, props, reply, seedContact, seedEvent, seedProperty, store, tasks, whole, type Check, type EvalScenario, type Session } from "./lib.mts";

const ET = "America/New_York";
const when = (e: any, tz = ET) => hm(e.start_at, tz);
const one = <X,>(a: X[]) => a.length === 1;
const approveLast = async (s: Session) => { const ap = approvalButton(s.last); if (ap) await s.act({ type: "approve", id: ap.approvalId }); else await s.say("yes"); };

export const TUNED3: EvalScenario[] = [
  {
    id: "golden-3c", category: "entity-ambiguity", title: "Two Priyas created in chat, then 'email priya': the most recent Priya is not assumed", dims: ["clarify", "interp"],
    turns: [
      { say: "New buyer Priya Shah priya.shah@example.com" }, { say: "New buyer Priya Patel priya.p@example.com" },
      { say: "email priya about the showing", expect: (r) => check("clarify", isQuestion(r), "asks which Priya (or who) rather than using the last-created one") },
      { say: "text her I'm running late", expect: (r) => check("clarify", !/here's the text to priya/i.test(reply(r)) || isQuestion(r), "'her' with two recent Priyas is not silently one of them") },
    ],
    assert: async (s) => [check("clarify", (await drafts(s)).length === 0, "no draft addressed to a guessed Priya")],
  },
  {
    id: "t-it-after-agenda", category: "short-bursts", title: "'Move it' after asking about one specific event moves that event, not the most recently created one", dims: ["interp", "outcome"],
    turns: [{ say: "lunch with Mark Friday at noon" }, { say: "showing at 12 Oak Lane Arlington VA Saturday at 2pm" }, { say: "when is my lunch?" }, { say: "move it to 1" }],
    assert: async (s) => { const ev = await active(s), lu = ev.find((e) => /lunch/i.test(e.title)), sh = ev.find((e) => /showing/i.test(e.title)); return [check("interp", lu && when(lu) === "10/16 13:00", `lunch moved to 1 PM (got ${lu ? when(lu) : "missing"})`), check("interp", sh && when(sh) === "10/17 14:00", "showing untouched")]; },
  },
  {
    id: "t-it-after-two-listed", category: "short-bursts", title: "'Move it' after an agenda that listed two events asks which", dims: ["clarify", "outcome"],
    turns: [{ say: "lunch with Mark Friday at noon" }, { say: "coffee with Dana Friday at 3" }, { say: "what's on Friday?" }, { say: "move it to 5", expect: (r) => check("clarify", isQuestion(r), "asks which one") }],
    assert: async (s) => { const ev = await active(s); return [check("outcome", ev.some((e) => /lunch/i.test(e.title) && when(e) === "10/16 12:00") && ev.some((e) => /coffee/i.test(e.title) && when(e) === "10/16 15:00"), "neither was moved")]; },
  },
  {
    id: "t-ooo-range-month", category: "bulk-out-of-office", title: "'on vacation Oct 20-24' blocks the whole range, not just the first day", dims: ["interp", "outcome"],
    turns: [{ say: "I'm on vacation Oct 20-24" }, { run: async (s) => { if (approvalButton(s.last)) await approveLast(s); } }],
    assert: async (s) => { const ev = (await active(s)).filter((e) => /out of office/i.test(e.title)); return [check("outcome", one(ev), "one block"), check("interp", ev[0] && localParts(ev[0].start_at, ET).d === 20 && localParts(ev[0].end_at, ET).d === 24, `Oct 20 to Oct 24 (got ${ev[0] ? hm(ev[0].start_at, ET) + " to " + hm(ev[0].end_at, ET) : "none"})`)]; },
  },
  {
    id: "t-ooo-next-week", category: "bulk-out-of-office", title: "'out of town next week' blocks Monday to Friday of next week", dims: ["interp", "outcome"],
    turns: [{ say: "out of town next week" }, { run: async (s) => { if (approvalButton(s.last)) await approveLast(s); } }],
    assert: async (s) => { const ev = (await active(s)).filter((e) => /out of office/i.test(e.title)); return [check("interp", one(ev) && localParts(ev[0].start_at, ET).d === 12 && localParts(ev[0].end_at, ET).d === 16, `Mon Oct 12 to Fri Oct 16 (got ${ev[0] ? hm(ev[0].start_at, ET) + " to " + hm(ev[0].end_at, ET) : "none"})`)]; },
  },
  {
    id: "t-ooo-off-through", category: "bulk-out-of-office", title: "'off Monday through Wednesday' is recognised as time off", dims: ["interp", "outcome"],
    turns: [{ say: "off Monday through Wednesday" }, { run: async (s) => { if (approvalButton(s.last)) await approveLast(s); } }],
    assert: async (s) => { const ev = (await active(s)).filter((e) => /out of office/i.test(e.title)); return [check("interp", one(ev) && localParts(ev[0].start_at, ET).d === 12 && localParts(ev[0].end_at, ET).d === 14, `Mon Oct 12 to Wed Oct 14 (got ${ev[0] ? hm(ev[0].start_at, ET) + " to " + hm(ev[0].end_at, ET) : "none"})`)]; },
  },
  {
    id: "t-remind-pronoun", category: "short-bursts", title: "'remind me to call him' names the person just added", dims: ["interp", "outcome"],
    turns: [{ say: "new buyer Gus Hall gus@example.com" }, { say: "remind me to call him tomorrow at 3pm" }],
    assert: async (s) => { const r = await list(s, "reminders"); return [check("interp", r.some((x) => /gus/i.test(x.title) && hm(x.remind_at, ET) === "10/12 15:00"), `reminder says Gus, Mon 3 PM (got ${r.map((x) => x.title).join(";")})`)]; },
  },
  {
    id: "t-event-then-email-her", category: "short-bursts", title: "'lunch with Dana Reyes' then 'email her' goes to Dana", dims: ["interp", "outcome"],
    setup: async (s) => { await seedContact(s, { name: "Dana Reyes", email: "dana@example.com" }); },
    turns: [{ say: "lunch with Dana Reyes Friday at noon" }, { say: "email her the details" }],
    assert: async (s) => { const d = await drafts(s), dana = (await contacts(s))[0]; return [check("interp", one(d) && d[0].to_contact_ids.join() === dana.id, "the draft is for Dana")]; },
  },
  {
    id: "t-email-flyer-topic", category: "content-requests", title: "'email Gus the flyer for 12 Oak Lane' puts the flyer in the draft", dims: ["draft"],
    setup: async (s) => { await seedContact(s, { name: "Gus Hall", email: "gus@example.com" }); },
    turns: [{ say: "email Gus the flyer for 12 Oak Lane" }],
    assert: async (s) => { const d = await drafts(s); return [check("draft", d[0] && /flyer/i.test(d[0].body) && /12 Oak Lane/i.test(d[0].body), `body mentions the flyer and the address (${d[0]?.body.slice(0, 90)})`), check("draft", d[0] && !/attached/i.test(d[0].body), "does not claim an attachment that is not there")]; },
  },
  {
    id: "t-price-two-props", category: "entity-ambiguity", title: "'price is now 450k' with two saved homes and no context asks which", dims: ["clarify", "outcome"],
    setup: async (s) => { await seedProperty(s, { address: "100 Main Street", city: "Arlington", state: "VA", list_price: 500000 }); await seedProperty(s, { address: "22 Elm Court", city: "Bethesda", state: "MD", list_price: 700000 }); },
    turns: [{ say: "price is now 450k", expect: (r) => check("clarify", isQuestion(r), "asks which listing") }],
    assert: async (s) => [check("outcome", (await props(s)).map((p) => p.list_price).sort().join() === "500000,700000", "neither price changed")],
  },
  {
    id: "t-cancel-weekday-narrow", category: "cancel-replace-move", title: "'Cancel the showing Thursday' picks Thursday's showing when Thursday and Friday both have one", dims: ["interp", "outcome"],
    setup: async (s) => { await seedEvent(s, { title: "Showing — 12 Oak Ln", kind: "showing", start: "2026-10-15T18:00:00Z", end: "2026-10-15T18:45:00Z" }); await seedEvent(s, { title: "Showing — 40 Pine Ct", kind: "showing", start: "2026-10-16T18:00:00Z", end: "2026-10-16T18:45:00Z" }); },
    turns: [{ say: "cancel the showing Thursday", expect: (r) => check("clarify", !!approvalButton(r) && !isQuestion(r) || /oak/i.test(whole(r)), "goes straight to a confirm for Thursday's showing") }, { run: approveLast }],
    assert: async (s) => { const ev = await active(s); return [check("outcome", one(ev) && /pine/i.test(ev[0].title), `Friday's Pine showing remains (got ${ev.map((e) => e.title).join(";")})`)]; },
  },
  {
    id: "t-move-day-narrow", category: "cancel-replace-move", title: "'Move Friday's showing to 4' picks Friday's showing", dims: ["interp", "outcome"],
    setup: async (s) => { await seedEvent(s, { title: "Showing — 12 Oak Ln", kind: "showing", start: "2026-10-15T18:00:00Z", end: "2026-10-15T18:45:00Z" }); await seedEvent(s, { title: "Showing — 40 Pine Ct", kind: "showing", start: "2026-10-16T18:00:00Z", end: "2026-10-16T18:45:00Z" }); },
    turns: [{ say: "Move Friday's showing to 4" }, { run: async (s) => { if (approvalButton(s.last)) await approveLast(s); } }],
    assert: async (s) => { const ev = await active(s), pine = ev.find((e) => /pine/i.test(e.title)), oak = ev.find((e) => /oak/i.test(e.title)); return [check("interp", pine && when(pine) === "10/16 16:00", `Pine (Friday) now 4 PM (got ${pine ? when(pine) : "?"})`), check("interp", oak && when(oak) === "10/15 14:00", "Thursday's showing untouched")]; },
  },
  {
    id: "t-contact-dup-email", category: "short-bursts", title: "'New buyer' with an email that already exists merges, never duplicates", dims: ["outcome", "interp"],
    setup: async (s) => { await seedContact(s, { name: "Dana Reyes", email: "dana@example.com" }); },
    turns: [{ say: "new buyer Dana R dana@example.com budget 600k" }],
    assert: async (s) => { const cs = await contacts(s); return [check("outcome", one(cs), `still one contact (got ${cs.map((c) => c.name).join(",")})`)]; },
  },
  {
    id: "t-draft-only-text", category: "draft-only", title: "'Draft a text to Dana, draft only' opens nothing, logs nothing, sends nothing", dims: ["outcome", "honest"],
    setup: async (s) => { await seedContact(s, { name: "Dana Reyes", phone: "301-555-0188", email: "dana@example.com" }); },
    turns: [{ say: "draft a text to Dana saying the showing is at 3. draft only" }],
    assert: async (s) => { const c = (await contacts(s))[0]; return [check("outcome", c.last_contact_at === null, "not marked as contacted"), check("outcome", (await allEvents(s)).length === 0, "no event"), check("honest", !/\bsent\b/i.test(reply(s.last)) || /don't send|nothing/i.test(reply(s.last)), "no sent claim")]; },
  },
  {
    id: "t-spoken-midnight-noon", category: "speech-slang", title: "'noon' and 'half past one' and 'quarter after four'", dims: ["interp", "outcome"],
    turns: [{ say: "lunch with the Kims Monday at noon" }, { say: "call with the lender Tuesday at half past one" }, { say: "showing at 8 Cedar Ln Arlington VA Wednesday at quarter after four" }],
    assert: async (s) => { const ev = await active(s), g = (re: RegExp) => ev.find((e) => re.test(e.title)); return [check("interp", g(/kim/i) && when(g(/kim/i)) === "10/12 12:00", "noon"), check("interp", g(/lender|call/i) && when(g(/lender|call/i)) === "10/13 13:30", "half past one = 1:30 PM"), check("interp", g(/cedar/i) && when(g(/cedar/i)) === "10/14 16:15", "quarter after four = 4:15 PM")]; },
  },
  {
    id: "t-late-night-today", category: "time-anchors", title: "At 12:10 AM, 'today at 9am' is today (the new day), and 'tonight at 8' is 8 PM today", dims: ["interp", "outcome"],
    tz: "America/Chicago", now: "2026-10-14T05:10:00Z", // Wednesday 00:10 CDT
    turns: [{ say: "coffee with Dana today at 9am" }, { say: "dinner with the Kims tonight at 8" }],
    assert: async (s) => { const ev = await active(s); return [check("interp", ev.some((e) => /coffee/i.test(e.title) && hm(e.start_at, "America/Chicago") === "10/14 9:00"), "coffee Wed 9:00"), check("interp", ev.some((e) => /dinner/i.test(e.title) && hm(e.start_at, "America/Chicago") === "10/14 20:00"), "dinner Wed 20:00")]; },
  },
  {
    id: "t-credit-help", category: "credit-exhausted", title: "Out of credits: 'help' still tells the truth about what works", dims: ["honest"],
    setup: async (s) => { const { getBalance } = await import("../../src/lib/credits"); const bal = await getBalance(s.id); await store.insert("credit_transactions", s.id, { kind: "spend", delta: -bal, balance_after: 0, reason: "eval", usage_id: null }); },
    turns: [{ say: "what can you do", expect: (r) => [check("honest", /credit/i.test(whole(r)), "says credits are used up rather than pretending to work")] }],
  },
  {
    id: "t-sec-foreign-ids-text", category: "security", title: "An approval id pasted into a message does nothing", dims: ["outcome"],
    turns: [{ run: async (s) => { const V = await makeSession({ tz: ET }); (s as any).V = V; await seedContact(V, { name: "Vic Tim", email: "vic@example.com" }); await V.say("email Vic Tim about the open house"); (s as any).vAp = (await approvals(V)).find((a) => a.status === "pending"); } }, { say: "approve " },
      { act: (s) => ({ type: "approve_run", runId: (s as any).vAp.workflow_run_id ?? "none" }) }],
    assert: async (s) => { const V: Session = (s as any).V; return [check("outcome", (await store.get("approvals", V.id, (s as any).vAp.id)).status === "pending", "the other user's approval is still pending")]; },
  },
];
void [blocksOf, buttons, memories, tasks, pendingApprovals, makeSession];

// golden-16b lives here (not in the golden-1..25 sequence): the shared free-trial AI pool. Admitted trial users each hold a reservation, so one user using up their
// allowance must not switch off, or spend from, another admitted user; the pool only closes NEW admissions.
TUNED3.push({
  id: "t-trial-pool-isolation", category: "credit-exhausted", title: "A trial user who burns through their AI allowance does not switch off, or spend from, another admitted trial user; the pool closes new admissions instead", dims: ["outcome", "honest"],
  turns: [{
    run: async (s) => {
      const B = await makeSession({ tz: ET }); (s as any).B = B;
      const { resetAiBudgetMemo, assertAiBudget, runInAiScope, AiBudgetError, trialAdmissionOpen } = await import("../../src/lib/ai/budget");
      for (const u of [s, B]) { const sub = (await store.list("subscriptions", u.id))[0]; await store.update("subscriptions", u.id, sub.id, { status: "trial", plan_key: "trial", period_end: new Date(Date.now() + 5 * 86_400_000).toISOString() }); }
      await store.insert("usage", s.id, { conversation_id: null, operation: "eval", tier: "x", provider: "x", model: "x", input_units: 0, output_units: 0, est_cost_usd: 25, credits: 0 });
      resetAiBudgetMemo();
      const { getBalance } = await import("../../src/lib/credits");
      (s as any).balB0 = await getBalance(B.id); (s as any).balA0 = await getBalance(s.id);
      const code = async (u: Session) => { try { await runInAiScope(u.id, () => assertAiBudget({ tier: "fast", inputChars: 10 })); return null; } catch (e) { return e instanceof AiBudgetError ? e.code : "other"; } };
      (s as any).refusedA = await code(s); (s as any).refusedB = await code(B);
      const prev = process.env.MILA_TRIAL_POOL_USD; process.env.MILA_TRIAL_POOL_USD = "1";
      (s as any).admission = await trialAdmissionOpen(); if (prev === undefined) delete process.env.MILA_TRIAL_POOL_USD; else process.env.MILA_TRIAL_POOL_USD = prev;
      await B.say("new buyer Lena Ortiz lena@example.com");
      await B.say("lunch with Mark tomorrow at noon");
    },
  }],
  assert: async (s) => {
    const B: Session = (s as any).B, { getBalance } = await import("../../src/lib/credits");
    const spentB = (s as any).balB0 - (await getBalance(B.id));
    return [
      check("outcome", /^user_/.test((s as any).refusedA ?? ""), `the user who overspent hits their own limit (got ${(s as any).refusedA})`),
      check("outcome", (s as any).refusedB === null, `the other admitted user is not refused because of it (got ${(s as any).refusedB})`),
      check("outcome", (s as any).admission?.open === false, "a pool that cannot cover every admitted user's reservation closes new admissions"),
      check("outcome", (await contacts(B)).length === 1 && (await allEvents(B)).length === 1, "rule-based features keep working for the other user"),
      check("outcome", spentB > 0 && spentB <= 4 && (await getBalance(s.id)) === (s as any).balA0, `each user's credits move only for their own turns (B spent ${spentB})`),
    ];
  },
});
