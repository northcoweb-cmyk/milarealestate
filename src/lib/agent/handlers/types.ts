import type { Block } from "../../types";

export interface HandlerOut {
  text: string;
  blocks: Block[];
  /** credit key to charge for this handler (config.credit_costs) */
  creditKey?: string;
  /** an upper bound on the credits for this turn (a research answer that delivered nothing never costs the full price) */
  maxCredits?: number;
}
export const reply = (text: string, blocks: Block[] = [], creditKey?: string): HandlerOut => ({ text, blocks, creditKey });
