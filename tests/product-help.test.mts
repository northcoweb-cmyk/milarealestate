// Questions about Mila itself get a fixed, accurate answer; real work that happens to use the same words is never hijacked.
import test from "node:test";
import assert from "node:assert/strict";
import { detectIntent } from "../src/lib/agent/intents.ts";
import { productTopic } from "../src/lib/agent/handlers/product-help.ts";

test("questions about Mila are recognized", () => {
  const cases: [string, string][] = [
    ["How much does Mila cost?", "pricing"], ["what are credits", "credits"], ["How long is the free trial?", "trial"], ["how do I cancel my subscription", "cancel"],
    ["How do I connect my Apple calendar?", "calendar"], ["how can I import my contacts", "import"], ["I want to talk to support", "support"], ["how does the referral program work", "referral"], ["is my data private?", "data"],
  ];
  for (const [q, key] of cases) { assert.equal(productTopic(q)?.key, key, q); assert.equal(detectIntent(q).intent, "product_help", q); }
});

test("real work with similar words is not hijacked", () => {
  for (const q of ["Put a call on my calendar for Friday at 3", "Send Dana the pricing for 12 Oak St", "Dana wants a referral for a lender", "Email Sam about the trial run on Friday", "Add my calendar for next week to the open house", "How much is 12 Oak St listed for?", "Top up the listing photos for 5 Elm Ave"]) {
    assert.notEqual(detectIntent(q).intent, "product_help", q);
  }
});
