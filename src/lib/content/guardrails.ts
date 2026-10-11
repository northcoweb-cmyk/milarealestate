/**
 * Wording that can create fair-housing or advertising problems, and claims Mila can't support. This is a prompt to REVIEW, never a block and never legal advice:
 * the agent decides. Each flag explains why it is flagged.
 */
export interface WordingFlag { phrase: string; why: string }

const RULES: { re: RegExp; why: string }[] = [
  { re: /\b(?:perfect|ideal|great) for (?:a )?(?:young )?(?:families|couples|singles|retirees|professionals|kids|children|seniors|bachelors?)\b/i, why: "Describing who a home is \"for\" can steer buyers. Describe the home instead." },
  { re: /\b(?:family[- ]friendly|adult[- ]only|no kids|singles only|christian|church|synagogue|mosque|ethnic|exclusive neighborhood|safe neighborhood|good schools?|bad schools?)\b/i, why: "Describing people, religion or neighborhood \"safety\" or school quality can raise fair-housing concerns. Stick to facts about the property." },
  { re: /\b(?:master (?:bed(?:room)?|suite|bath(?:room)?)|walking distance to (?:church|temple))\b/i, why: "\"Master\" is being retired in many markets; \"primary\" is safer." },
  { re: /\b(?:the best|#1|number one|guaranteed|can't miss|won't last|sells? (?:itself|fast)|the lowest price|undervalued|steal|best deal|dream home|once[- ]in[- ]a[- ]lifetime)\b/i, why: "An unsupported superlative or promise. Use only what you can show." },
  { re: /\b(?:hot market|prices (?:are )?(?:up|down)|market (?:is|has) (?:up|down)|appreciat\w+ \d+%|up \d+%|down \d+%)\b/i, why: "A market statistic Mila can't source in this post. Add it yourself only if you can back it up." },
];

export function wordingFlags(text: string): WordingFlag[] {
  const out: WordingFlag[] = [];
  for (const r of RULES) { const m = r.re.exec(text); if (m) out.push({ phrase: m[0], why: r.why }); }
  return out;
}
