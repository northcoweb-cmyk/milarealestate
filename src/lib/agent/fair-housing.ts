/**
 * A request to write, show or market a home by who may live in it (race, religion, national origin, family status, disability, age)
 * is declined before any draft exists, whatever the wording. Plain buyer needs ("3 bed near good schools") are not caught here.
 */
const GROUP = "white|black|asian|hispanic|latino|latina|latinx|african|mexican|chinese|indian|korean|arab|christian|jewish|muslim|catholic|hindu|mormon|immigrants?|foreigners?|american|straight|gay|lgbt\\w*|disabled|handicapped|wheelchair users?|elderly|seniors?|retirees|young|old|single|married";
const PEOPLE = "couples?|families|family|buyers?|people|folks|professionals|singles|renters|tenants|residents|neighbors|neighbours|crowd|community";

const STEER: RegExp[] = [
  new RegExp(`\\b(?:perfect|ideal|great|best|suitable|good|only|exclusively|target|market(?:ed)?(?: (?:it|this|that|these|the (?:home|listing|property)))?(?: to)?|appeal(?:s|ing)? to|aimed at|geared (?:to|toward)|for)\\s+(?:for\\s+|to\\s+)?(?:(?:${GROUP})(?:\\s+and\\s+|,\\s*|\\s+))+(?:${PEOPLE})\\b`, "i"),
  /\b(?:perfect|ideal|great|best|suitable|good|only|for)\s+(?:for\s+)?(?:an?\s+)?(?:family|families|couple|couples|buyers?|people)\s+(?:with)?out\s+(?:any\s+)?(?:kids|children)\b|\b(?:child|kid)[- ]?free\b/i,
  /\bno (?:kids|children|families|section 8|disabled|handicapped|wheelchairs?|minorities|foreigners)\b/i,
  /\b(?:adults?|singles?|couples?|families|seniors?|christians?|whites?) only\b/i,
  /\bnot (?:suitable|good|ideal|right|safe) for (?:the )?(?:disabled|handicapped|wheelchair\w*|elderly|families|kids|children|minorities|seniors)\b/i,
  new RegExp(`\\b(?:only|just)\\s+show\\b.*\\b(?:${GROUP})\\b`, "i"),
  new RegExp(`\\b(?:keep|steer|avoid|exclude|screen out|filter out|don't show|do not show|no)\\b.*\\b(?:${GROUP})\\s+(?:${PEOPLE})\\b`, "i"),
  /\bwhite (?:neighbou?rhood|area|street)\b|\b(?:black|asian|hispanic|latino|jewish|muslim|christian) (?:neighbou?rhood|area|street)\b/i,
];

export function fairHousingBlock(text: string): boolean {
  const t = text.slice(0, 3000);
  return STEER.some((r) => r.test(t));
}

export const FAIR_HOUSING_REPLY = "I can't write or target a listing, post or search by who might live there (race, religion, national origin, family status, disability, age and similar). That's steering under the Fair Housing Act, so I haven't drafted anything. I can describe the home itself: layout, features, upgrades, lot, location facts and commute. Want me to do that instead?";
