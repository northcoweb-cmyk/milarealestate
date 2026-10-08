import { newAgent, store } from "../qa/harness.mts";
import { CONVOS } from "./convos.ts";

const now = new Date("2026-10-08T14:00:00Z"); const tz = "America/New_York";
let bad = 0; const lines: string[] = [];
for (const c of CONVOS) {
  const a = await newAgent({ now, tz, seed: false });
  const outs: string[] = []; let err = "";
  for (const t of c.turns) { try { const r = await a.say(t); outs.push(`${r.milaMessage.content}${(r.milaMessage.blocks ?? []).length ? "  [" + r.milaMessage.blocks.map((b: any) => b.type).join(",") + "]" : ""}`); } catch (e) { err = String(e); outs.push("!!ERROR " + err); } }
  const fails: string[] = [];
  (c.expect ?? []).forEach((rx, i) => {
    if (!rx) return;
    if (/^events:\d+$/.test(rx)) return; // checked below
    if (!new RegExp(rx, "i").test(outs[i] ?? "")) fails.push(`turn ${i + 1} wanted /${rx}/`);
  });
  const ev = (c.expect ?? []).find((x) => /^events:\d+$/.test(x));
  if (ev) { const n = (await store.list("calendar_events", a.id)).length; if (n !== Number(ev.split(":")[1])) fails.push(`wanted ${ev}, got ${n}`); }
  const fallback = outs.some((o) => /I'm not sure how to do that yet/.test(o));
  const flag = err ? "ERROR" : fails.length ? "FAIL" : fallback ? "FALLBACK(AI path)" : "ok";
  if (flag === "FAIL" || flag === "ERROR") bad++;
  lines.push(`\n[${flag}] ${c.id}${fails.length ? "  -> " + fails.join("; ") : ""}`);
  c.turns.forEach((t, i) => lines.push(`  > ${t}\n  < ${(outs[i] ?? "").slice(0, 230).replace(/\n+/g, " | ")}`));
}
console.log(lines.join("\n")); console.log(`\n${CONVOS.length} conversations, ${bad} failing`);
