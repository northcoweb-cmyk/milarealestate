// Runs the whole creator program (access, reminders, expiry, free month, free-month end) against a tiny fake database. Run: cd admin-os && node --import tsx scripts/creators-e2e.mts
import assert from "node:assert/strict";
import { start } from "./mock-sb.mts";
const { db, close } = start(5999);
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
console.log("creator program e2e OK");
close();
