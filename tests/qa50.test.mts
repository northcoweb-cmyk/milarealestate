// The 50 hard conversations (tests/qa50/convos.ts) as a regression suite: every one must pass its checks and none may crash.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { CONVOS } from "./qa50/convos.ts";

const now = new Date("2026-10-08T14:00:00Z");
const tz = "America/New_York";

test("50 hard conversations: all pass", async () => {
  const failures: string[] = [];
  for (const c of CONVOS) {
    const a = await newAgent({ now, tz, seed: false });
    const outs: string[] = [];
    for (const t of c.turns) { try { outs.push((await a.say(t)).milaMessage.content); } catch (e) { outs.push(`!!ERROR ${e}`); failures.push(`${c.id}: crashed on "${t}"`); } }
    (c.expect ?? []).forEach((rx, i) => {
      if (!rx) return;
      if (/^events:\d+$/.test(rx)) return;
      if (!new RegExp(rx, "i").test(outs[i] ?? "")) failures.push(`${c.id}: turn ${i + 1} wanted /${rx}/ got "${(outs[i] ?? "").slice(0, 120)}"`);
    });
    const ev = (c.expect ?? []).find((x) => /^events:\d+$/.test(x));
    if (ev) { const n = (await store.list("calendar_events", a.id)).length; if (n !== Number(ev.split(":")[1])) failures.push(`${c.id}: wanted ${ev}, got ${n}`); }
    if (outs.some((o) => /<\/?(reply|invoke)\b/i.test(o))) failures.push(`${c.id}: raw tags in a reply`);
  }
  assert.deepEqual(failures, []);
});
