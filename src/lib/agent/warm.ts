// Texts that read like a person typed them to someone they like, not like the agent's own words pasted into a template.
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Turn what the agent said ("I'm running 10 minutes late") into a warm, natural text to `first`. */
export function warmText(first: string, bodyIn: string, me: string): string {
  const body = bodyIn.trim().replace(/\s+/g, " ").replace(/[.!\s]+$/, "");
  const lower = body.toLowerCase();
  let mid: string;
  const late = /running (?:about |around )?(\d+)?\s*(?:minutes?|mins?)?\s*(?:late|behind)|running late|be (?:a few|a couple) minutes late/.exec(lower);
  if (late) {
    const n = late[1] ? ` about ${late[1]} minutes` : " a few minutes";
    mid = `Quick heads up, I'm running${n} behind. Thank you so much for your patience, I'll see you very soon!`;
  } else if (/\b(reschedul|move (?:it|our|the)|push (?:it|our|the)|cancel)/.test(lower)) {
    mid = `${cap(body)}. I'm sorry for the change! What other time would work well for you?`;
  } else if (/\b(see you|looking forward|on my way|i'?m here|i'?m outside|just arrived)\b/.test(lower)) {
    mid = `${cap(body)}!`;
  } else if (/\b(thank|thanks|appreciate)\b/.test(lower)) {
    mid = `${cap(body)}! It was really great working with you.`;
  } else if (/\?$/.test(bodyIn.trim())) {
    mid = cap(body.replace(/\?+$/, "")) + "?";
  } else if (/\b(just checking in|checking in|touch base|follow(?:ing)? up)\b/.test(lower)) {
    mid = `${cap(body)}. No rush at all, just let me know if there's anything I can help with!`;
  } else {
    mid = `${cap(body)}. Let me know if you have any questions!`;
  }
  return `Hi ${first}! ${mid} – ${me}`.replace(/\.\.+/g, ".").replace(/!\./g, "!").replace(/\?\./g, "?");
}
