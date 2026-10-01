import fs from "node:fs";
import { checkInvariants, newAgent, snapshot, store } from "./harness.mts";
import { buildScenarios, type Step } from "./scenarios.mts";
import { putFile } from "../../src/lib/files";
import { randomUUID } from "node:crypto";

const only = process.argv[2];
const out = process.argv[3] ?? "/tmp/qa-report.json";
const all = buildScenarios().filter((s) => !only || only === "all" || s.cat === only);
const fails: { id: string; cat: string; msg: string; log: string[] }[] = [];
let turns = 0, passed = 0;
const t0 = Date.now();

for (const sc of all) {
  const a = await newAgent({ now: sc.now, tz: sc.tz, seed: sc.seed });
  let bad = false;
  const fail = (m: string) => { bad = true; fails.push({ id: sc.id, cat: sc.cat, msg: m, log: [`tz=${sc.tz} now=${sc.now.toISOString()}`, ...a.log] }); };
  try {
    let prev: any = null;
    for (const raw of sc.steps) {
      const step: Step = typeof raw === "function" ? raw(a, prev) : raw;
      const snap = await snapshot(a);
      const t = Date.now();
      let extra: any = {};
      if (step.files) {
        const ids: string[] = [];
        for (const f of step.files) {
          const id = randomUUID();
          const sp = await putFile(a.id, id, Buffer.from(f.body), f.mime);
          const kind = f.name.endsWith(".csv") || f.name.endsWith(".tsv") ? "csv" : "text";
          await store.insert("documents", a.id, { id, name: f.name, kind, mime: f.mime, size_bytes: f.body.length, storage_path: sp, text_content: null, extracted: null, property_id: null, contact_id: null, summary: null });
          ids.push(id);
        }
        extra = { attachmentIds: ids };
      }
      const r = step.act ? await a.act(step.act) : await a.say(step.say ?? "", extra);
      turns++;
      prev = r;
      const ms = Date.now() - t;
      const inv = await checkInvariants(a, r, snap, ms, step.allow);
      for (const m of inv) fail("INVARIANT: " + m);
      const c = step.check ? await step.check(r, a) : undefined;
      for (const m of ([] as string[]).concat(c ?? [])) fail(m);
    }
    if (sc.custom) for (const m of await sc.custom(a)) fail(m);
  } catch (e: any) { fail("EXCEPTION: " + (e?.stack ?? e).toString().split("\n").slice(0, 4).join(" | ")); }
  if (!bad) passed++;
}

// group by signature
const sig = (f: { cat: string; msg: string }) => f.cat + " :: " + f.msg.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<ts>").replace(/"[^"]{0,80}"/g, '"…"').replace(/\d+/g, "#").slice(0, 110);
const groups = new Map<string, typeof fails>();
for (const f of fails) { const k = sig(f); groups.set(k, [...(groups.get(k) ?? []), f]); }
const sorted = [...groups].sort((a, b) => b[1].length - a[1].length);
fs.writeFileSync(out, JSON.stringify({ scenarios: all.length, turns, passed, groups: sorted.map(([k, v]) => ({ signature: k, count: v.length, examples: v.slice(0, 3) })) }, null, 1));
console.log(`\nScenarios: ${all.length}  turns: ${turns}  passed: ${passed}  failed: ${all.length - passed}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log(`Distinct failure signatures: ${sorted.length}\n`);
for (const [k, v] of sorted.slice(0, 40)) console.log(`${String(v.length).padStart(4)}×  ${k}\n        e.g. ${v[0].msg.slice(0, 230)}`);
