// Scenario inventory: tuned (the parser was iterated against these) and held-out (written first, never tuned against).
import type { EvalScenario } from "./lib.mts";
import { HELD_OUT } from "./s-heldout.mts";
import { HELD_OUT_2 } from "./s-heldout2.mts";
import { HELD_OUT_3 } from "./s-heldout3.mts";
import { TUNED } from "./s-tuned.mts";
import { TUNED2 } from "./s-tuned2.mts";
import { TUNED3 } from "./s-tuned3.mts";

const ALL: EvalScenario[] = [...HELD_OUT, ...HELD_OUT_2, ...HELD_OUT_3, ...TUNED, ...TUNED2, ...TUNED3];
const n = (s: EvalScenario) => (/^golden-(\d+)$/.exec(s.id)?.[1] ? Number(/^golden-(\d+)$/.exec(s.id)![1]) : 0);
// golden-1..25 first, in order; everything else after
export const SCENARIOS: EvalScenario[] = [...ALL.filter((s) => n(s)).sort((a, b) => n(a) - n(b)), ...ALL.filter((s) => !n(s))];
