import type { Intent } from "../intents";
import type { Block } from "../../types";
import type { Ctx } from "../context";
import { persistState } from "../conversation";
import { type HandlerOut, reply } from "./types";

/**
 * Ask a follow-up question AND remember what we were doing, so the answer ("3pm", "Saturday", "Frederick, MD")
 * continues the same request instead of being treated as a brand-new, unrelated message.
 */
export async function askBack(ctx: Ctx, intent: Intent, text: string, missing: string, question: string, blocks: Block[] = []): Promise<HandlerOut> {
  ctx.state.pending = { kind: "clarify", intent, slots: { text }, missing };
  await persistState(ctx);
  return reply(question, blocks);
}
