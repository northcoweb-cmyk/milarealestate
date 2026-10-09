// Where an answer came from (websites, links, providers) is never shown to an agent.
import test from "node:test";
import assert from "node:assert/strict";
import { plainText } from "../src/lib/agent/plain.ts";

test("links, citations and source lines are removed from anything Mila says", () => {
  const raw = "⚠️ I pulled the records, but this address is Dell Diamond, the Round Rock Express ballpark. (milb.com (https://www.milb.com/round-rock/about/front-office?utm_source=openai)) Confirm the parcel. See [the listing](https://www.zillow.com/x) or https://redfin.com/a and (realtor.com).\nSources: Zillow, Redfin";
  const t = plainText(raw);
  assert.doesNotMatch(t, /https?:|utm_source|milb|zillow|redfin|realtor\.com|Sources:/i);
  assert.match(t, /Dell Diamond, the Round Rock Express ballpark\./);
  assert.match(t, /See the listing or and/);
});
