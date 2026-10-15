// Open-house sign-in sheets from a spreadsheet: find the header under a title row, read wordy headers, keep the other columns as notes.
import test from "node:test";
import assert from "node:assert/strict";
import { rowsToCandidates } from "../src/lib/agent/ingest.ts";

test("a sign-in sheet with a title row and wordy headers is read correctly", () => {
  const rows = [
    ["Open House · 12 Oak St · Sunday 1-3"],
    [""],
    ["Your Name", "Phone #", "Email Address", "Price range?", "Pre-approved?", "Working with an agent?"],
    ["Sam Lee", "301-555-0100", "sam@example.com", "$450-500k", "Yes", "No"],
    ["Priya Nair", "(240) 555-0199", "priya@example.com", "", "No", "Yes"],
  ];
  const c = rowsToCandidates(rows);
  assert.equal(c.length, 2);
  assert.equal(c[0].name, "Sam Lee");
  assert.equal(c[0].email, "sam@example.com");
  assert.ok(c[0].phone?.replace(/\D/g, "").endsWith("3015550100"));
  assert.match(c[0].notes ?? "", /Price range: \$450-500k/);
  assert.match(c[0].notes ?? "", /Pre-approved: Yes/);
  assert.match(c[0].notes ?? "", /Working with an agent: No/);
  assert.equal(c[1].name, "Priya Nair");
  assert.doesNotMatch(c[1].notes ?? "", /Price range/); // empty cells add nothing
});

test("first and last name columns are joined, and a plain header row still works", () => {
  const c = rowsToCandidates([["First Name", "Last Name", "E-mail", "Mobile"], ["Dana", "Cho", "dana@example.com", "2025550133"]]);
  assert.equal(c[0].name, "Dana Cho");
  assert.equal(c[0].email, "dana@example.com");
});
