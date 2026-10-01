import type { Block } from "../../types";

export interface HandlerOut {
  text: string;
  blocks: Block[];
  /** credit key to charge for this handler (config.credit_costs) */
  creditKey?: string;
}
export const reply = (text: string, blocks: Block[] = [], creditKey?: string): HandlerOut => ({ text, blocks, creditKey });
