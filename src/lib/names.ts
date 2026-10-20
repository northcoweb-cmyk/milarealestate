/** First-name logic shared by every greeting, task title, toast and draft, so one rule decides who a message is addressed to. */
const TITLE = /^(?:dr|mr|mrs|ms|mx|miss|prof|rev|hon|sr|jr)\.?$/i;
const TAG = /^[A-Z]{2,}$/;

export function firstNameOf(full: string): string {
  const toks = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return full ?? "";
  let i = 0;
  while (i < toks.length - 1 && TITLE.test(toks[i])) i++; // "Dr. Sam Okafor" is Sam
  // two or more leading ALL-CAPS tags in front of a real name ("QA TEST Jordan Lee") are not the first name; a single one ("AJ Lee") is
  let j = i; while (j < toks.length - 1 && TAG.test(toks[j])) j++;
  if (j - i >= 2 && j < toks.length) i = j;
  return toks[i] ?? toks[0];
}

/** Names, titles and notes are plain text: any markup typed or pasted into them is removed ("Lee <b>bold</b>" becomes "Lee bold"). */
export function stripMarkup(s: string): string {
  return s.replace(/<\/?[a-z][^>]*>/gi, "").replace(/\s{2,}/g, " ").trim();
}
