// scratch probe: run with a JSON spec {setup:[...], msgs:[...]} ; prints blocks fully
import { makeSession, seedContact, seedProperty, store, buttons } from "./lib.mts";
const spec = JSON.parse(process.argv[2]);
const s = await makeSession({ tz: spec.tz, now: spec.now });
for (const c of spec.contacts ?? []) await seedContact(s, c);
for (const p of spec.props ?? []) await seedProperty(s, p);
for (const m of spec.msgs) {
  const r = typeof m === "string" ? await s.say(m) : await s.act(m);
  console.log("> " + (typeof m === "string" ? m : JSON.stringify(m)) + "\n< " + r.milaMessage.content);
  console.log("   BLOCKS " + JSON.stringify(r.milaMessage.blocks).slice(0, Number(process.env.W ?? 1500)));
}
if (process.env.DUMP) for (const t of process.env.DUMP.split(",")) console.log(t, JSON.stringify(await store.list(t, s.id)).slice(0, 3000));
