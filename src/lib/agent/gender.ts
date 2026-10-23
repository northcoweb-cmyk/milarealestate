import type { Contact } from "../types";
import type { Ctx } from "./context";

const F = new Set("rhea maria sarah dana emma olivia ava sophia isabella mia amelia harper evelyn abigail emily ella elizabeth sofia avery scarlett grace chloe victoria riley aria lily aubrey zoey penelope lillian addison layla natalie camila hannah brooklyn zoe nora leah savannah audrey claire eleanor skylar ellie samantha stella paisley violet mila allison alexa anna hazel aaliyah ariana lucy caroline sadie gianna jennifer jessica ashley amanda stephanie nicole melissa michelle kimberly amy angela laura linda patricia susan karen nancy lisa betty margaret sandra donna carol ruth sharon cynthia kathleen shirley helen deborah rachel carolyn janet catherine maria heather diane julie joyce virginia kelly christina joan evelyn lauren judith megan cheryl andrea hannah jacqueline martha gloria teresa sara janice marie julia kathryn ana priya mei yuki fatima aisha nia dani tina rosa lena nina tara".split(" "));
const M = new Set("tobias liam noah oliver elijah james william benjamin lucas henry alexander mason michael ethan daniel jacob logan jackson levi sebastian mateo jack owen theodore aiden samuel joseph john david wyatt matthew luke asher carter julian grayson leo jayden gabriel isaac lincoln anthony hudson dylan ezra thomas charles christopher jaxon maverick josiah isaiah andrew elias joshua nathan aaron robert richard kevin brian george edward ronald timothy jason jeffrey ryan jacob gary nicholas eric jonathan stephen larry justin scott brandon benjamin frank gregory raymond samuel patrick jack dennis jerry tyler aaron jose adam nathan henry zachary douglas peter kyle walter ethan jeremy harold keith christian roger noah gerald carl terry sean austin arthur lawrence jesse dylan bryan joe jordan billy bruce albert willie gabriel alan juan wayne roy ralph randy eugene vincent russell elijah louis bobby philip johnny victor marcus omar raj amir mike tom bob jim bill dave steve chris matt".split(" "));

export type Gender = "f" | "m" | null;
export const genderOf = (name: string): Gender => { const f = name.toLowerCase().replace(/^qa test\s+/, "").split(/\s+/)[0]; return F.has(f) && !M.has(f) ? "f" : M.has(f) && !F.has(f) ? "m" : null; };
export const pronounGender = (p: string): Gender => (/^(?:her|she|hers)$/i.test(p) ? "f" : /^(?:him|he|his)$/i.test(p) ? "m" : null);

/** "Text her…": the person just discussed, unless their name clearly doesn't fit the pronoun; then the most recent contact whose name does. */
export async function contactForPronoun(ctx: Ctx, pronoun: string): Promise<Contact | null> {
  const lastId = ctx.state.last_contact_ids?.[0];
  const last = lastId ? await ctx.store.get("contacts", ctx.userId, lastId) : null;
  const want = pronounGender(pronoun);
  const g = last ? genderOf(last.name) : null;
  if (last && (!want || !g || g === want)) return last;
  if (!want) return last;
  const recent = (await ctx.store.list("contacts", ctx.userId)).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 25);
  return recent.find((c) => genderOf(c.name) === want) ?? last;
}
