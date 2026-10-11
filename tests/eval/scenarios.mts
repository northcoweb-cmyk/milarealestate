// Scenario inventory: tuned (the parser was iterated against these) and held-out (written first, never tuned against).
import type { EvalScenario } from "./lib.mts";
import { HELD_OUT } from "./s-heldout.mts";

const ALL: EvalScenario[] = [...HELD_OUT];
const n = (s: EvalScenario) => (/^golden-(\d+)$/.exec(s.id)?.[1] ? Number(/^golden-(\d+)$/.exec(s.id)![1]) : 0);
// golden-1..25 first, in order; everything else after
export const SCENARIOS: EvalScenario[] = [...ALL.filter((s) => n(s)).sort((a, b) => n(a) - n(b)), ...ALL.filter((s) => !n(s))];
