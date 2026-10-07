import { detectIntent } from "../../src/lib/agent/intents";
import { SCENARIOS } from "./scenarios";
let ok = 0; const miss: string[] = [];
for (const s of SCENARIOS) {
  const got = detectIntent(s.q).intent; const exp = Array.isArray(s.expect) ? s.expect : [s.expect];
  if (exp.includes(got)) ok++; else miss.push(`[${s.group.slice(0, 18)}] "${s.q.slice(0, 70)}" → ${got} (wanted ${exp.join("|")})`);
}
console.log(`routing ${ok}/${SCENARIOS.length}`); console.log(miss.join("\n"));
