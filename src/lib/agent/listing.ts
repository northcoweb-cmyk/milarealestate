/** Pulls everything an agent naturally says about a listing out of one message, so Mila never has to ask for what was already said. */
export interface ListingFacts { list_price?: number; beds?: number; baths?: number; sqft?: number; year_built?: number; seller?: string; notes?: string[] }

const money = (n: string, u?: string) => { let v = parseFloat(n.replace(/,/g, "")); const k = (u ?? "").toLowerCase(); if (k === "k" || k === "thousand") v *= 1000; else if (k === "m" || k === "mm" || k === "million") v *= 1_000_000; return Math.round(v); };

export function extractListingFacts(raw: string): ListingFacts {
  const t = raw.replace(/–|—/g, "-");
  const f: ListingFacts = {};

  // price: "$875,000", "875k", "listed at 1.2m", "for 540k", "asking $650K"
  const plausible = (m: RegExpMatchArray) => { const v = money(m[1], m[2]); return v >= 20_000 && v <= 200_000_000 ? v : null; };
  const notStreet = (m: RegExpMatchArray) => !new RegExp(`^\\s+[A-Za-z]+(?:\\s+[A-Za-z]+)?\\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|way|boulevard|blvd|place|pl|terrace|circle|cir|trail|run)\\b`, "i").test(t.slice((m.index ?? 0) + m[0].length));
  const dollars = [...t.matchAll(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|mm|million|thousand)?\b/gi)].find((m) => plausible(m) != null);
  const cues = [...t.matchAll(/(?:list(?:ed|ing)?(?:\s+(?:at|for|price))?|asking|priced?(?:\s+at)?|for|at)\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|mm|million|thousand)\b/gi)].find((m) => plausible(m) != null && notStreet(m));
  const bareCue = [...t.matchAll(/(?:list(?:ed|ing)?(?:\s+(?:at|for|price))?|asking|priced?(?:\s+at)?|for|at)\s*(\d[\d,]{4,})\b(?!\s*(?:sq|sf|square))/gi)].find((m) => plausible(m) != null && notStreet(m));
  const pick = dollars ?? cues ?? bareCue;
  if (pick) f.list_price = plausible(pick)!;
  // "asking 899" / "listed at 475": a bare three-digit number after a price cue is thousands
  else {
    const short = /(?:asking|listed\s+(?:at|for)|list\s+price|priced?(?:\s+at)?)\s*(\d{3})(?:\.\d)?(?![\d,]|\.\d|\s*(?:sq|sf|square|bed|bd|br|bath|ba\b|%|k\b|m\b))/i.exec(t);
    if (short) f.list_price = +short[1] * 1000;
  }

  // "3/2", "3/2.5", "4 bed 3 bath", "3br 2ba", "3 bedroom, 2 bathroom"
  const slash = /\b(\d)\s*\/\s*(\d(?:\.5)?)\b(?!\s*\/\s*\d)/.exec(t);
  const bed = /\b(\d{1,2})\s*[- ]?(?:bed(?:room)?s?|br|bd|bdrm)s?\b/i.exec(t);
  const bath = /\b(\d{1,2}(?:\.5)?)\s*[- ]?(?:bath(?:room)?s?|ba|bth)s?\b/i.exec(t);
  if (bed) f.beds = +bed[1]; else if (slash) f.beds = +slash[1];
  if (bath) f.baths = +bath[1]; else if (slash) f.baths = +slash[2];

  const sq = /(?<![\d,])(\d{1,2},\d{3}|\d{3,5})\s*(?:sq\.?\s*ft\.?|sqft|square\s*(?:feet|foot|ft)|sf)\b/i.exec(t);
  if (sq) f.sqft = +sq[1].replace(/,/g, "");
  const yr = /\b(?:built(?:\s+in)?|year built)\s*:?\s*(1[89]\d{2}|20[0-2]\d)\b/i.exec(t);
  if (yr) f.year_built = +yr[1];

  // "sellers are the Hendersons", "seller is John Smith", "owners: Dana and Tom Lee"
  const sel = /\b(?:[Ss]ellers?|[Oo]wners?|[Cc]lients?)\s*(?:are|is|:|-)\s*(?:the\s+)?([A-Z][a-zA-Z'’.-]+(?:\s+(?:and|&)\s+[A-Z][a-zA-Z'’.-]+)?(?:\s+[A-Z][a-zA-Z'’.-]+)?)/.exec(t) ?? /\b(?:for|with)\s+the\s+([A-Z][a-z]+s)\b/.exec(t);
  if (sel) f.seller = sel[1].trim();
  return f;
}

export const hasAnyFact = (f: ListingFacts) => Object.keys(f).some((k) => k !== "notes" && f[k as keyof ListingFacts] != null);
export function describeStated(f: ListingFacts): string {
  return [f.beds != null ? `${f.beds} bd` : null, f.baths != null ? `${f.baths} ba` : null, f.sqft ? `${f.sqft.toLocaleString("en-US")} sq ft` : null, f.list_price ? `$${f.list_price.toLocaleString("en-US")}` : null].filter(Boolean).join(" · ");
}
