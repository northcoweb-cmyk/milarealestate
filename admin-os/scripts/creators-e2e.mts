// Runs the whole creator program (access, reminders, expiry, free month, free-month end) against a tiny fake database. Run: cd admin-os && node --import tsx scripts/creators-e2e.mts
import assert from "node:assert/strict";
import { start } from "./mock-sb.mts";
const { db, close } = start(5999);
const realFetch = globalThis.fetch; const mails: string[] = []; process.env.RESEND_API_KEY = "test";
globalThis.fetch = (async (u: any, init?: any) => { if (String(u).includes("api.resend.com")) { mails.push(JSON.parse(init.body).subject); return new Response("{}", { status: 200 }); } return realFetch(u, init); }) as typeof fetch;
process.env.SUPABASE_URL = "http://localhost:5999"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.CRON_SECRET = "x".repeat(32);
const C = await import("../src/lib/creators.ts");
const cron = await import("../src/app/api/cron/creators/route.ts");
const { write, table } = await import("../src/lib/sb.ts");
const DAY = 86_400_000;
const mk = async (name: string, email: string, extra: any = {}) => (await write<any>("creators", "POST", { body: { name, email, token: C.newToken(), ...extra } }))![0];
db.profiles.push({ id: "u1", email: "dev@x.com" }); db.subscriptions.push({ id: "s1", user_id: "u1", status: "trial", period_end: new Date(Date.now() + 2 * DAY).toISOString(), stripe_subscription_id: null });
// 1. an active creator, 5 days in, no reminder yet: day-4 reminder due; trial is stretched to cover the deadline
const c1 = await mk("Dev Okafor", "dev@x.com", { status: "active", access_at: new Date(Date.now() - 5 * DAY).toISOString(), deadline_at: new Date(Date.now() + 9 * DAY).toISOString() });
let r = await (await cron.GET(new Request("http://x/api/cron/creators", { headers: { authorization: `Bearer ${"x".repeat(32)}` } }))).json();
assert.equal(r.synced, 1, "trial extended"); assert.ok(new Date(db.subscriptions[0].period_end).getTime() > new Date(c1.deadline_at).getTime(), "covers the deadline");
assert.equal((await cron.GET(new Request("http://x/api/cron/creators"))).status, 401, "cron needs the secret");
// 2. not enough time: expires
const c2 = await mk("Late Lia", "lia@x.com", { status: "active", access_at: new Date(Date.now() - 20 * DAY).toISOString(), deadline_at: new Date(Date.now() - 2 * DAY).toISOString() });
r = await (await cron.GET(new Request("http://x/api/cron/creators", { headers: { authorization: `Bearer ${"x".repeat(32)}` } }))).json();
assert.equal(r.expired, 1); assert.equal(db.creators.find((x) => x.id === c2.id).status, "expired");
// 3. three verified videos -> reward is allowed, writes the plan and the credit ledger
for (let i = 0; i < 3; i++) await write("creator_videos", "POST", { body: { creator_id: c1.id, url: `https://tiktok.com/@dev/video/${i}`, status: "verified" } });
const all = (await C.loadAll())!; const todo = C.attention(all.creators, all.videos);
assert.equal(todo[0].kind, "reward");
const g = await C.giveFreeMonth(db.creators.find((x) => x.id === c1.id));
assert.ok(g.ok, g.message); assert.equal(db.subscriptions[0].status, "active"); assert.equal(db.subscriptions[0].credits_per_period, 1200);
assert.equal(db.credit_transactions.at(-1).delta, 1200); assert.equal(db.creators.find((x) => x.id === c1.id).status, "rewarded");
// 4. the free month ends: plan set to canceled, then the creator is not touched again
db.creators.find((x) => x.id === c1.id).reward_ends_at = new Date(Date.now() - DAY).toISOString();
r = await (await cron.GET(new Request("http://x/api/cron/creators", { headers: { authorization: `Bearer ${"x".repeat(32)}` } }))).json();
assert.equal(r.ended, 1); assert.equal(db.subscriptions[0].status, "canceled");
// 5. a paying customer is never switched off
db.profiles.push({ id: "u2", email: "pay@x.com" }); db.subscriptions.push({ id: "s2", user_id: "u2", status: "active", period_end: new Date().toISOString(), stripe_subscription_id: "sub_1" });
const c3 = await mk("Paying Pat", "pay@x.com", { status: "rewarded", reward_ends_at: new Date(Date.now() - DAY).toISOString() });
assert.equal(await C.endFreeMonth(db.creators.find((x) => x.id === c3.id)), "now a paying customer"); assert.equal(db.subscriptions[1].status, "active");

// ---- round 2: nudges, activity, partners, statements, payouts
const FIRST = (n: string) => ({ authorization: `Bearer ${"x".repeat(32)}` });
const run = async () => (await (await cron.GET(new Request("http://x/api/cron/creators", { headers: FIRST("") }))).json());
// 6. activity: an account with no messages is "not used"; messages are counted since access
db.profiles.push({ id: "u3", email: "quiet@x.com", created_at: new Date().toISOString() });
const act0 = await C.activityOf("quiet@x.com", new Date(Date.now() - DAY).toISOString()); assert.equal(act0.account, true); assert.equal(act0.messages, 0);
for (let i = 0; i < 12; i++) db.messages.push({ user_id: "u3", role: "user", created_at: new Date().toISOString() });
assert.equal((await C.activityOf("quiet@x.com", new Date(Date.now() - DAY).toISOString())).messages, 12);
assert.equal((await C.activityOf("nobody@x.com", null)).account, false);
// 7. nudges: no account by day 2 -> signin nudge once (marked); account but silent by day 4 -> use nudge once
const noLogin = await mk("No Login", "nologin@x.com", { status: "active", access_at: new Date(Date.now() - 3 * DAY).toISOString(), deadline_at: new Date(Date.now() + 11 * DAY).toISOString() });
let rr = await run(); assert.ok(rr.nudged >= 1); const nl = () => db.creators.find((x: any) => x.id === noLogin.id);
assert.ok(nl().sent.signin, "marked so it never repeats"); const n1 = mails.length; await run(); assert.equal(mails.filter((m) => /login is waiting/.test(m)).length, 1, "the sign-in nudge goes once"); void n1;
// 8. promote to partner: needs the free month first; sets code, terms, month key; access renewed
db.profiles.push({ id: "u4", email: "star@x.com", created_at: new Date().toISOString() }); db.subscriptions.push({ id: "s4", user_id: "u4", status: "canceled", period_end: new Date(Date.now() - DAY).toISOString(), stripe_subscription_id: null });
const star = await mk("Star Creator", "star@x.com", { status: "rewarded" });
const pr = await C.makePartner(db.creators.find((x: any) => x.id === star.id), { commissionPct: 25, commissionMonths: 6, videosPerMonth: 3 });
assert.ok(pr.ok, pr.message); const sc = db.creators.find((x: any) => x.id === star.id);
assert.equal(sc.status, "partner"); assert.equal(sc.commission_pct, 25); assert.match(sc.ref_code, /^[A-Z0-9]{6,9}$/); assert.equal(db.subscriptions.find((x: any) => x.id === "s4").status, "active");
// 9. statement: payments recorded on referred profiles become commission, capped to N months, minus payouts
db.profiles.push({ id: "r1", email: "ref1@x.com", full_name: "Ref One", created_at: new Date().toISOString(), settings: { referral: { partner: { id: star.id, code: sc.ref_code, payments: [ { at: "2026-11-05T00:00:00Z", cents: 3900, ref: "a" }, { at: "2026-12-05T00:00:00Z", cents: 3900, ref: "b" }, { at: "2027-09-05T00:00:00Z", cents: 3900, ref: "late" } ] } } } });
db.subscriptions.push({ id: "sr1", user_id: "r1", plan_key: "mila", status: "active", stripe_subscription_id: "sub_x" });
const st = await C.statementOf(sc);
assert.equal(st.signups, 1); assert.equal(st.paying, 1);
assert.equal(st.byPeriod.find((p) => p.period === "2026-11")!.owedCents, Math.round(3900 * 0.25), "25% of the first payment");
assert.ok(!st.byPeriod.some((p) => p.period === "2027-09"), "a payment past the 6-month window earns nothing");
db.partner_payouts.push({ id: "p1", creator_id: star.id, period: "2026-11", amount_cents: 975 });
const st2 = await C.statementOf(sc); assert.equal(st2.byPeriod.find((p) => p.period === "2026-11")!.owedCents, 0); assert.equal(st2.paidCents, 975);
// 10. monthly quota: a partner who made last month's videos is renewed, one who didn't is paused
const lastMonth = new Date(); lastMonth.setUTCDate(1); lastMonth.setUTCDate(0); const lm = new Date(lastMonth.getTime() - 5 * DAY).toISOString();
const vid = (cid: string) => db.creator_videos.push({ id: crypto.randomUUID(), creator_id: cid, url: "https://tiktok.com/@a/video/" + Math.random(), status: "verified", kind: "partner", verified_at: lm, checks: {}, flags: [] });
const olderSince = new Date(Date.now() - 70 * DAY).toISOString();
db.profiles.push({ id: "u5", email: "good@x.com" }, { id: "u6", email: "bad@x.com" }); db.subscriptions.push({ id: "s5", user_id: "u5", status: "active", period_end: new Date(Date.now() - DAY).toISOString(), stripe_subscription_id: null }, { id: "s6", user_id: "u6", status: "active", period_end: new Date(Date.now() - DAY).toISOString(), stripe_subscription_id: null });
const good = await mk("Good Partner", "good@x.com", { status: "partner", tier: "partner", partner_since: olderSince, videos_per_month: 2, sent: { renewed: "2000-01" } });
const lazy = await mk("Lazy Partner", "bad@x.com", { status: "partner", tier: "partner", partner_since: olderSince, videos_per_month: 2, sent: { renewed: "2000-01" } });
vid(good.id); vid(good.id); vid(lazy.id);
rr = await run();
assert.equal(db.creators.find((x: any) => x.id === good.id).status, "partner"); assert.equal(db.subscriptions.find((x: any) => x.id === "s5").status, "active"); assert.ok(new Date(db.subscriptions.find((x: any) => x.id === "s5").period_end) > new Date());
assert.equal(db.creators.find((x: any) => x.id === lazy.id).status, "paused"); assert.equal(db.subscriptions.find((x: any) => x.id === "s6").status, "canceled");
console.log("creator program e2e OK (round 2)");
close();
