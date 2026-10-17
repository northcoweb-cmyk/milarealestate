// Audit P0-01: nobody ever sees or sends a raw {{first_name}}.
import test from "node:test";
import assert from "node:assert/strict";
import { renderMerge, unresolvedBlanks } from "../src/lib/merge.ts";

test("one recipient gets their first name, several get 'there', unknown blanks are reported", () => {
  const body = "Hi {{first_name}},\n\nOpen house Saturday.";
  assert.equal(renderMerge(body, [{ name: "Priya Shah" }]), "Hi Priya,\n\nOpen house Saturday.");
  assert.equal(renderMerge(body, [{ name: "Priya Shah" }, { name: "Dana Reyes" }]), "Hi there,\n\nOpen house Saturday.");
  assert.equal(renderMerge(body, []), "Hi there,\n\nOpen house Saturday.");
  assert.equal(renderMerge(body, [{ name: "QA TEST Jordan Lee" }]).split(",")[0], "Hi Jordan");
  assert.deepEqual(unresolvedBlanks("Hi {{first_name}} and {{ last_name }}"), ["first_name", "last_name"]);
  assert.deepEqual(unresolvedBlanks("Hi Priya,"), []);
});
