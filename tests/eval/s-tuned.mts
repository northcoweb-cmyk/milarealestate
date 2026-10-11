// TUNED scenarios: the agent's rules were iterated against these (and they stay as regression coverage). Same state-based oracles as the held-out set.
import { active, allEvents, approvals, approvalButton, blocksOf, btn, buttons, check, contacts, drafts, hm, isQuestion, list, localParts, makeSession, memories, pendingApprovals, props, reply, seedContact, seedEvent, seedProperty, store, tasks, whole, type Check, type EvalScenario, type Session } from "./lib.mts";

const NOW = "2026-10-11T14:00:00Z"; // Sunday 10:00 ET
const ET = "America/New_York";
const when = (e: any, tz = ET) => hm(e.start_at, tz);
const one = <X,>(a: X[]) => a.length === 1;
const approveLast = async (s: Session) => { const ap = approvalButton(s.last); if (ap) await s.act({ type: "approve", id: ap.approvalId }); else await s.say("yes"); };
const WF = (r: any) => blocksOf(r, "workflow").find((b) => /WHAT I DID/i.test(b.kicker ?? ""));
const twoPriyas = async (s: Session) => { await seedContact(s, { name: "Priya Shah", email: "priya.shah@example.com", phone: "301-555-0101" }); await seedContact(s, { name: "Priya Patel", email: "priya.p@example.com", phone: "301-555-0102" }); };
const twoMains = async (s: Session) => { await seedProperty(s, { address: "100 Main Street", city: "Arlington", state: "VA", list_price: 500000 }); await seedProperty(s, { address: "200 Main Street", city: "Bethesda", state: "MD", list_price: 700000 }); };

export const TUNED: EvalScenario[] = [
  // ------------------------------------------------------------------ the brief's golden scenarios (tuned set)
  {
    id: "golden-1", category: "cancel-replace-move", title: "Cancel the Oak open house and replace it with Pine at an overlapping time; the original is inactive", dims: ["interp", "outcome", "honest"], see: "tests/event-replacement.test.mts",
    turns: [
      { say: "I have an open house at 100 Oak Street Arlington VA Saturday from 1-3" },
      { say: "Cancel the Oak open house and replace it with an open house at 200 Pine Street Arlington VA Saturday from 2-4", expect: async (r, s) => [check("outcome", !!approvalButton(r), "a single confirm button is offered"), check("outcome", (await active(s)).length === 1 && /oak/i.test((await active(s))[0].title), "nothing changes until confirmed")] },
      { run: approveLast },
    ],
    assert: async (s) => {
      const act = await active(s), all = await allEvents(s);
      return [
        check("outcome", one(act) && /pine/i.test(act[0].title) && when(act[0]) === "10/17 14:00", `only Pine, 2:00 PM, is active (got ${act.map((e) => e.title + " " + when(e)).join("; ")})`),
        check("outcome", all.find((e) => /oak/i.test(e.title))?.status === "cancelled", "the original Oak event is inactive"),
        check("outcome", all.length === 2, "no stray events"),
      ];
    },
  },
  {
    id: "golden-3", category: "entity-ambiguity", title: "Two Priyas and two Main Streets: Mila asks, never picks arbitrarily", dims: ["clarify", "interp", "outcome"],
    setup: async (s) => { await twoPriyas(s); await twoMains(s); },
    turns: [
      { say: "email priya about the showing", expect: (r) => check("clarify", isQuestion(r), "lowercase 'priya' with two Priyas is a question") },
      { say: "update Priya's budget to 700k", expect: (r) => check("clarify", isQuestion(r) && !/saved to priya/i.test(reply(r)), "does not write a budget onto a guessed Priya") },
      { say: "text priya I'm running late", expect: (r) => check("clarify", isQuestion(r), "asks which Priya for a text") },
      { say: "prep me for my meeting with Priya", expect: (r) => check("clarify", isQuestion(r) || !/priya shah/i.test(reply(r)), "does not prep for an arbitrary Priya") },
    ],
    assert: async (s) => {
      const cs = await contacts(s), mem = await memories(s);
      return [
        check("outcome", (await drafts(s)).length === 0, "no draft was created for a guessed Priya"),
        check("outcome", cs.every((c) => c.budget_max == null) && !mem.some((m) => /700/.test(m.value)), "no budget was written to either Priya"),
        check("outcome", (await props(s)).map((p) => p.list_price).sort().join() === "500000,700000", "neither Main Street changed"),
      ];
    },
  },
  {
    id: "golden-3b", category: "entity-ambiguity", title: "A full name picks one Priya without asking (no unnecessary clarification)", dims: ["clarify", "interp"],
    setup: async (s) => { await twoPriyas(s); },
    turns: [{ say: "email Priya Patel about the showing", expect: (r) => check("clarify", !/which/i.test(reply(r)), "does not ask which Priya when the surname is given") }],
    assert: async (s) => { const d = await drafts(s), p = (await contacts(s)).find((c) => /patel/i.test(c.name))!; return [check("interp", one(d) && d[0].to_contact_ids.join() === p.id, "the draft is for Priya Patel")]; },
  },
  {
    id: "golden-7", category: "edits-after-approval", title: "Editing the draft or recipient after the approval was created voids it; re-asking creates a new one", dims: ["outcome", "honest"], see: "tests/approval-binding.test.mts",
    setup: async (s) => { await seedContact(s, { name: "Dana Reyes", email: "dana@example.com" }); },
    turns: [
      { say: "email Dana about the Oak Street showing" },
      { run: async (s) => { const d = (await drafts(s))[0]; await store.update("email_drafts", s.id, d.id, { body: "Totally different text the agent never saw." }); } },
      { act: (s) => ({ type: "approve", id: approvalButton(s.last)?.approvalId ?? "missing" }), expect: async (r) => check("honest", /changed after you were shown it/i.test(reply(r)), `stale approval is refused with an explanation (got: ${reply(r).slice(0, 100)})`) },
      { say: "email Dana about the Oak Street showing" },
    ],
    assert: async (s) => {
      const ap = await approvals(s);
      return [
        check("outcome", ap.some((a) => a.status === "failed"), "the stale approval is closed as failed"),
        check("outcome", (await drafts(s)).every((d) => d.status !== "sent"), "nothing was sent"),
        check("outcome", ap.filter((a) => a.status === "pending").length <= 1, "at most one fresh pending approval afterwards"),
      ];
    },
  },
  {
    id: "golden-7b", category: "edits-after-approval", title: "A cancel approval is voided when the event is moved after the preview", dims: ["outcome", "honest"],
    setup: async (s) => { await seedEvent(s, { title: "Showing — 12 Oak Ln", kind: "showing", start: "2026-10-15T18:00:00Z", end: "2026-10-15T19:00:00Z" }); },
    turns: [
      { say: "cancel the showing" },
      { run: async (s) => { const e = (await active(s))[0]; await store.update("calendar_events", s.id, e.id, { start_at: "2026-10-15T20:00:00.000Z", end_at: "2026-10-15T21:00:00.000Z" }); } },
      { act: (s) => ({ type: "approve", id: approvalButton(s.last)?.approvalId ?? "x" }), expect: (r) => check("honest", /changed after you were shown it/i.test(reply(r)), "refused") },
    ],
    assert: async (s) => [check("outcome", (await active(s)).length === 1, "the event was not canceled")],
  },
  {
    id: "golden-7c", category: "edits-after-approval", title: "A post caption edited after the post approval was created voids that approval", dims: ["outcome", "honest"],
    turns: [
      { say: "make an instagram post for 12 Oak Lane Arlington VA" },
      { run: async (s) => { const p = (await list(s, "social_posts"))[0]; await store.update("social_posts", s.id, p.id, { caption: "New caption the agent never reviewed" }); } },
      {
        run: async (s) => { const ap = (await approvals(s)).find((a) => a.status === "pending" && /social/.test(a.payload.tool)); if (ap) await s.act({ type: "approve", id: ap.id }); },
        expect: async (r, s) => check("honest", !(await approvals(s)).some((a) => a.status === "executed" && /social/.test(a.payload.tool)), "the edited post was not published"),
      },
    ],
    assert: async (s) => [check("outcome", (await list(s, "social_posts")).every((p) => p.status !== "published"), "nothing is published")],
  },
  {
    id: "golden-9", category: "integrations", title: "Provider timeout after the local save: honest pending sync, safe retry", dims: ["honest", "outcome"],
    setup: async (s) => {
      const { encrypt } = await import("../../src/lib/integrations/crypto");
      await store.insert("integrations", s.id, { provider: "google", status: "connected", account_label: "a@b.c", scopes: ["https://www.googleapis.com/auth/calendar.events"], token_encrypted: encrypt(JSON.stringify({ access_token: "t", expires_at: Date.now() + 3_600_000 })), error: null, connected_at: new Date().toISOString() });
      const real = globalThis.fetch; (globalThis as any).__realFetch = real; (s as any).gcalCalls = 0; (s as any).gcalUp = false;
      globalThis.fetch = (async (u: any, i: any) => {
        if (!String(u).includes("googleapis.com")) return real(u, i);
        (s as any).gcalCalls++;
        if (!(s as any).gcalUp) throw new DOMException("The operation timed out.", "TimeoutError");
        return new Response(JSON.stringify({ id: "gcal-evt-1" }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch;
    },
    turns: [
      { say: "showing at 12 Oak Lane Arlington VA Saturday at 2pm", expect: async (r, s) => [check("honest", /google|sync|calendar app|not (?:yet )?(?:on|in|synced)|isn't (?:on|in)/i.test(whole(r)) && /(?:didn't|not|couldn't|isn't|hasn't|pending|timed out)/i.test(whole(r)), `says the Google Calendar sync did not finish (got: ${reply(r).slice(0, 140)})`), check("outcome", one(await active(s)), "the event is saved locally")] },
      { say: "showing at 12 Oak Lane Arlington VA Saturday at 2pm" },
      { run: async (s) => { (s as any).gcalUp = true; } },
      { act: (s) => buttons(s.replies.at(-2)).find((b) => b.action?.type === "sync_event")?.action ?? buttons(s.replies.at(-3)).find((b) => b.action?.type === "sync_event")?.action ?? { type: "sync_event", eventId: "none" }, expect: async (r, s) => check("outcome", (await active(s))[0]?.external_id === "gcal-evt-1", "retry pushes the event to Google exactly once") },
      { act: (s) => ({ type: "sync_event", eventId: (s as any).evId ?? "none" }) },
    ],
    assert: async (s) => {
      globalThis.fetch = (globalThis as any).__realFetch;
      const ev = await allEvents(s);
      return [check("outcome", one(ev), "retrying never duplicates the event"), check("outcome", ev[0]?.external_id === "gcal-evt-1" && ev[0]?.synced_at, "marked synced only after Google confirmed")];
    },
  },
  {
    id: "golden-10", category: "property-facts", status: "not_implemented", reason: "no evidence/provenance model for property facts: two sites repeating one syndicated origin are not distinguished from independent confirmation", title: "Two sites agreeing from one syndicated origin is not independent verification", dims: ["factual"], turns: [],
  },
  {
    id: "golden-11", category: "property-facts", title: "List price, automated estimate and property taxes stay separate categories", dims: ["factual", "honest"],
    setup: async (s) => {
      const p = await seedProperty(s, { address: "14 Cedar Lane", city: "Arlington", state: "VA", list_price: 600000, beds: 3, baths: 2, sqft: 1800, verified: true });
      await store.insert("memories", s.id, { scope: "property", subject_id: p.id, key: `cache:property_lookup:${p.id}`, value: JSON.stringify({ at: NOW, found: true, full: true, facts: { beds: 3, baths: 2, sqft: 1800, list_price: 600000, year_built: 1995, status: "Active", type: "Single Family" }, sources: [{ title: "Public records & listing data", url: "" }], extra: { year_built: 1995, lot_sqft: null, property_type: "Single Family", last_sale_price: 410000, last_sale_date: "2019-05-01", est_value: 540000, est_low: 510000, est_high: 575000, days_on_market: 12, listed_date: "2026-09-29", list_status: "Active", hoa_fee: null, tax_year: 2025, tax_amount: 6200, garage_spaces: null, pool: null, stories: null, listing_agent: null, listing_office: null, mls: null, lat: null, lng: null, subdivision: null } }), source: "system", confidence: 0.6, pinned: false });
    },
    turns: [{ say: "prep 14 Cedar Lane Arlington VA", expect: (r) => {
      const t = reply(r);
      return [
        check("factual", /active listing at \$600,000/i.test(t), "list price labelled as the listing price"),
        check("factual", /estimated value \$540,000/i.test(t) && /automated estimate|not an appraisal/i.test(t), "the estimate is labelled as an automated estimate, not an appraisal"),
        check("factual", /\$6,200/.test(t) && /tax/i.test(t), "taxes are their own line"),
        check("factual", !/(?:is|are) worth \$|appraised/i.test(t), "no claim that the estimate is the value or an appraisal"),
        check("factual", (blocksOf(r, "listings")[0]?.cards?.[0]?.price) === 600000, "the card headline price is the list price, not the estimate"),
      ];
    } }],
  },
  {
    id: "golden-12", category: "property-facts", status: "not_implemented", reason: "pullListingPhotos (src/lib/images/listing.ts, outside the agent lane) attaches photos from any pasted link without checking the page's address against the property; street view needs city+state but no wrong-building detection", title: "A photo of the wrong building is not shown as the listing photo", dims: ["factual"], turns: [],
  },
  {
    id: "golden-13", category: "speech-slang", title: "Dictation errors in a date or name lead to a question before any harmful action (text proxy: voice input is typed text here)", dims: ["clarify", "outcome"],
    setup: async (s) => { await seedContact(s, { name: "Priya Shah", email: "priya@example.com" }); await seedEvent(s, { title: "Showing with Priya Shah — 12 Oak Ln", kind: "showing", start: "2026-10-17T18:00:00Z", end: "2026-10-17T19:00:00Z" }); },
    turns: [
      { say: "move my showing with Pria Sha to october thirty fifth at two", expect: async (r, s) => [check("clarify", isQuestion(r) || /isn't|not a real|which/i.test(reply(r)), "asks instead of guessing an impossible date"), check("outcome", (await active(s))[0].start_at === "2026-10-17T18:00:00.000Z", "the showing was not moved")] },
      { say: "cancel the showing with Pria", expect: async (r, s) => [check("outcome", (await active(s)).length === 1, "still on the calendar until confirmed"), check("outcome", !!approvalButton(r) || isQuestion(r), "a confirm step or a question, never a silent cancel")] },
    ],
    assert: async (s) => [check("outcome", (await active(s)).length === 1, "nothing was canceled or moved")],
  },
  {
    id: "golden-15", category: "integrations", title: "With no calendar or email connection, the morning plan says what it can and cannot see", dims: ["honest", "factual"],
    setup: async (s) => { await seedEvent(s, { title: "Showing — 12 Oak Ln", kind: "showing", start: "2026-10-11T18:00:00Z", end: "2026-10-11T19:00:00Z" }); },
    turns: [{ say: "what does my day look like today?", expect: (r) => [check("factual", /showing/i.test(whole(r)), "lists what is known"), check("honest", /google|gmail|calendar (?:is )?(?:not )?connect|only (?:see|know)|just what's in mila|not connected|connect/i.test(whole(r)), "discloses that external calendar/email is not connected so the plan may be incomplete")] }],
  },
  {
    id: "golden-16", category: "credit-exhausted", title: "Concurrent turns from two trial users each spend only their own entitlement", dims: ["outcome"],
    turns: [{
      run: async (s) => {
        const b = await makeSession({ now: NOW, tz: ET }); (s as any).B = b;
        const { getBalance } = await import("../../src/lib/credits");
        (s as any).bal0 = [await getBalance(s.id), await getBalance(b.id)];
        const { handleTurn } = await import("../../src/lib/agent/engine");
        await Promise.all([1, 2, 3].flatMap((i) => [handleTurn(s.a.profile, { message: `lunch w dana tmrw ${i + 10}am` }), handleTurn(b.a.profile, { message: `new buyer Lena${"abc"[i - 1]} Ortiz lena${i}@example.com` })]));
      },
    }],
    assert: async (s) => {
      const B: Session = (s as any).B, { getBalance } = await import("../../src/lib/credits");
      const [a0, b0] = (s as any).bal0 as number[];
      const spentA = a0 - (await getBalance(s.id)), spentB = b0 - (await getBalance(B.id));
      const txA = (await list(s, "credit_transactions")).filter((t) => t.kind === "spend"), txB = (await list(B, "credit_transactions")).filter((t) => t.kind === "spend");
      return [
        check("outcome", txA.length === 3 && txB.length === 3, `each user was charged for exactly their own 3 turns (A=${txA.length}, B=${txB.length})`),
        check("outcome", spentA > 0 && spentB > 0 && (await contacts(B)).length === 3 && (await contacts(s)).length === 0, "A has no contacts, B has its own three"),
        check("outcome", (await allEvents(s)).length >= 1 && (await allEvents(B)).length === 0, "events landed only in the user who asked"),
      ];
    },
  },
  {
    id: "golden-19", category: "security", title: "Another user's ids sent as agent actions are rejected and change nothing", dims: ["outcome", "honest"], see: "tests/security-audit.test.mts",
    turns: [{
      run: async (s) => {
        const V = await makeSession({ now: NOW, tz: ET }); (s as any).V = V;
        (s as any).vEv = await seedEvent(V, { title: "Showing — victim", kind: "showing", start: "2026-10-15T18:00:00Z", end: "2026-10-15T19:00:00Z" });
        (s as any).vC = await seedContact(V, { name: "Victim Client", email: "v@example.com" });
        (s as any).vP = await seedProperty(V, { address: "1 Victim Way", city: "X", state: "VA" });
        await V.say("email Victim Client about the open house");
        (s as any).vAp = (await approvals(V)).find((a) => a.status === "pending");
        for (const action of [
          { type: "approve", id: (s as any).vAp.id }, { type: "reject", id: (s as any).vAp.id },
          { type: "cancel_pick", eventId: (s as any).vEv.id }, { type: "move_apply", eventId: (s as any).vEv.id, start: "2026-10-16T18:00:00Z", end: "2026-10-16T19:00:00Z" },
          { type: "move_pick", eventId: (s as any).vEv.id, text: "move to 5pm" }, { type: "shift_events", eventIds: [(s as any).vEv.id], after: "2026-10-15T00:00:00Z" },
          { type: "event_reminder", eventId: (s as any).vEv.id, minutes: 30 }, { type: "tag_contact", contactId: (s as any).vC.id, tag: "pwned" },
          { type: "answer_questions", contactId: (s as any).vC.id, answers: { budget: "1" } }, { type: "quick_task", contactId: (s as any).vC.id, title: "x" },
          { type: "listing_checklist", propertyId: (s as any).vP.id }, { type: "set_pets", propertyId: (s as any).vP.id, policy: "No pets" },
          { type: "listing_worksheet", propertyId: (s as any).vP.id, answers: { price: "1" } }, { type: "replace_pick", eventId: (s as any).vEv.id },
          { type: "import_merge", contactId: (s as any).vC.id, candidate: { email: "evil@x.test", phone: null, notes: "x" } },
        ]) { try { await s.act(action); } catch { /* a rejected action may throw; the turn wrapper reports it */ } }
      },
    }],
    assert: async (s) => {
      const V: Session = (s as any).V, vc = await store.get("contacts", V.id, (s as any).vC.id), ve = await store.get("calendar_events", V.id, (s as any).vEv.id), vap = await store.get("approvals", V.id, (s as any).vAp.id);
      const vp = await store.get("properties", V.id, (s as any).vP.id);
      return [
        check("outcome", ve.status === "confirmed" && ve.start_at === new Date("2026-10-15T18:00:00Z").toISOString(), "the victim's event is untouched"),
        check("outcome", vap.status === "pending", "the victim's approval is still pending"),
        check("outcome", !vc.tags.includes("pwned") && vc.email === "v@example.com", "the victim's contact is untouched"),
        check("outcome", (await tasks(s)).length === 0 && (await list(s, "reminders")).length === 0, "the attacker got no tasks or reminders about the victim's records"),
        check("outcome", vp.address === "1 Victim Way" && (await list(V, "reminders")).length === 0, "the victim's property and reminders are untouched"),
        check("outcome", (await store.list("memories", V.id)).every((m: any) => !/No pets/.test(m.value)), "no cross-tenant writes"),
      ];
    },
  },
  {
    id: "golden-21", category: "feedback-not-entity", title: "'You got that wrong' is feedback, not a new contact or property", dims: ["interp", "outcome", "clarify"],
    setup: async (s) => { await seedContact(s, { name: "Dana Reyes", email: "dana@example.com" }); },
    turns: [
      { say: "what's on my calendar tomorrow" },
      { say: "You got that wrong", expect: (r) => check("clarify", /sorry|thanks|got it|what/i.test(reply(r)), "acknowledges the feedback") },
      { say: "you got that wrong." }, { say: "that was wrong" }, { say: "Wrong! I said Dana" }, { say: "not right" }, { say: "no that's incorrect" },
    ],
    assert: async (s) => [
      check("outcome", (await contacts(s)).length === 1, "no contact was created from feedback"),
      check("outcome", (await props(s)).length === 0, "no property was created from feedback"),
      check("outcome", (await allEvents(s)).length === 0 && (await tasks(s)).filter((t) => t.kind !== "approval").length === 0, "no event or task was created"),
    ],
  },
  {
    id: "golden-25", category: "property-facts", title: "A user's correction to beds and price survives a later property refresh", dims: ["factual", "outcome"],
    setup: async (s) => {
      process.env.RENTCAST_API_KEY = "test-key";
      const real = globalThis.fetch; (globalThis as any).__realFetch = real;
      globalThis.fetch = (async (u: any, i: any) => {
        const url = String(u);
        if (!url.includes("rentcast.io")) return real(u, i);
        const body = url.includes("/listings/sale") ? [{ addressLine1: "14 Cedar Lane", city: "Arlington", state: "VA", zipCode: "22201", bedrooms: 5, bathrooms: 4, squareFootage: 3100, price: 899000, status: "Active", daysOnMarket: 4 }]
          : url.includes("/avm/value") ? { price: 880000, priceRangeLow: 850000, priceRangeHigh: 910000 } : [{ addressLine1: "14 Cedar Lane", city: "Arlington", state: "VA", zipCode: "22201", bedrooms: 5, bathrooms: 4, squareFootage: 3100 }];
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch;
      await seedProperty(s, { address: "14 Cedar Lane", city: "Arlington", state: "VA", list_price: 489000, beds: 3, baths: 2 });
    },
    turns: [
      { say: "the 14 Cedar Lane listing is actually 4 bed 2 bath, $479,000" },
      { say: "prep 14 Cedar Lane Arlington VA" },
    ],
    assert: async (s) => {
      globalThis.fetch = (globalThis as any).__realFetch; delete process.env.RENTCAST_API_KEY;
      const p = (await props(s))[0];
      return [
        check("factual", p.beds === 4 && p.list_price === 479000, `the agent's correction is kept (beds=${p.beds}, price=${p.list_price})`),
        check("factual", one(await props(s)), "no duplicate property from the refresh"),
        check("honest", !/active listing at \$479,000/i.test(reply(s.last)) || /you (?:told|said|entered)|your/i.test(reply(s.last)), "does not present the agent's own number as if the listing feed said it"),
      ];
    },
  },
];
