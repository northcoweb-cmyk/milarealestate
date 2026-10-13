/** What Mila says out loud: the reply text with markup, links, emoji and long tails removed, cut at a sentence end. */
export function cleanForSpeech(input: string, max = 500): string {
  let t = (input ?? "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_#`>~|]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[‍️]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  t = end > max * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…";
  return t;
}

/** Conservative cost estimate for speech: about 1.7 cents per 1,000 characters. */
export const speechCostUsd = (chars: number) => Math.max(0.0005, (chars / 1000) * 0.017);
