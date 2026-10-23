import { newAgent, store } from "./harness.mts";
const a = await newAgent({ now: new Date("2026-10-23T19:00:00Z"), tz: "America/New_York", seed: false });
const C = (name: string, o: any = {}) => store.insert("contacts", a.id, { name, email: "d@example.com", phone: "301-555-0188", type: "buyer", status: "active", tags: [], notes: null, preferences: {}, location: null, budget_min: null, budget_max: null, timeline: null, source: null, importance: 2, last_contact_at: null, next_action: null, next_action_at: null, avatar_color: "#888", ...o });
await C("QA TEST Dana Whitfield", { location: "Rockville, MD" });
for (const q of JSON.parse(process.argv[2])) { try { const r = await a.say(q); console.log("Q:", q, "\nA:", r.milaMessage.content.replace(/\n+/g, " ⏎ ").slice(0, 300), "|", r.milaMessage.blocks.map((b:any)=>b.type).join(","), "| bal", r.balance); } catch (e) { console.log("Q:", q, "THROW", (e as Error).message); } }
console.log("DRAFTS", JSON.stringify((await store.list("email_drafts", a.id)).map((d:any)=>[d.subject,d.body.slice(0,400)]),null,1));
console.log("TASKS", JSON.stringify((await store.list("tasks", a.id)).map((t:any)=>t.title)));
