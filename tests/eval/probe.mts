import { newAgent, store } from "../qa/harness.mts";
const tz = process.env.TZ_ ?? "America/New_York";
const now = new Date(process.env.NOW_ ?? "2026-10-11T14:00:00Z");
const a = await newAgent({ now, tz, seed: process.env.SEED === "1" });
const msgs: string[] = JSON.parse(process.argv[2]);
for (const m of msgs) {
  const r = m.startsWith("{") ? await a.act(JSON.parse(m)) : await a.say(m);
  console.log("> " + m + "\n< " + r.milaMessage.content.slice(0, 400));
  for (const b of r.milaMessage.blocks) console.log("   [" + b.type + "] " + (b.title ?? "") + " " + (b.buttons ? b.buttons.map((x: any) => `<${x.label}${x.approvalId ? " AP" : ""}${x.action ? " " + JSON.stringify(x.action).slice(0, 90) : ""}>`).join(" ") : "") + (b.kicker ? " kicker=" + b.kicker : "") + (b.items ? " items=" + JSON.stringify(b.items).slice(0, 400) : ""));
}
for (const t of ["calendar_events", "contacts", "tasks", "properties", "email_drafts", "approvals", "social_posts"]) {
  const l = await store.list(t, a.id);
  console.log(t, l.length, l.slice(-6).map((x: any) => x.title ?? x.name ?? x.address ?? x.subject ?? x.status).join(" | "));
}
if (process.env.DUMP) for (const t of process.env.DUMP.split(",")) console.log(t, JSON.stringify(await store.list(t, a.id), null, 0).slice(0, 2500));
