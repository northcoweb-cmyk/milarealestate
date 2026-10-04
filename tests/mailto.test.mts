import test from "node:test";
import assert from "node:assert/strict";
import { gmailUrl, isTooLongForLink, mailtoUrl } from "../src/lib/mailto.ts";

test("mailto opens the email app with recipient, subject and body filled in (newlines kept)", () => {
  const u = mailtoUrl({ to: ["dana@example.com"], subject: "Thanks for coming — 12 Oak Ln", body: "Hi Dana,\n\nGreat to meet you & thanks!\n— Sarah" });
  assert.ok(u.startsWith("mailto:dana@example.com?"));
  assert.match(u, /subject=Thanks%20for%20coming/);
  assert.match(u, /body=Hi%20Dana%2C%0D%0A%0D%0AGreat%20to%20meet%20you%20%26%20thanks!/);
});

test("several recipients go in BCC so they can't see each other", () => {
  const u = mailtoUrl({ bcc: ["a@x.com", "b@y.com"], subject: "s", body: "b" });
  assert.ok(u.startsWith("mailto:?"));
  assert.match(u, /bcc=a%40x\.com%2Cb%40y\.com/);
});

test("Gmail link opens on the agent's own account so the sender is right", () => {
  const u = new URL(gmailUrl({ to: ["dana@example.com"], subject: "Hi", body: "Body" }, "sarah@gmail.com"));
  assert.equal(u.hostname, "mail.google.com");
  assert.equal(u.searchParams.get("authuser"), "sarah@gmail.com");
  assert.equal(u.searchParams.get("to"), "dana@example.com");
  assert.equal(u.searchParams.get("su"), "Hi");
  assert.equal(u.searchParams.get("view"), "cm");
});

test("very long messages are flagged so the full text can be copied as well", () => {
  assert.equal(isTooLongForLink({ subject: "s", body: "short" }), false);
  assert.equal(isTooLongForLink({ subject: "s", body: "x".repeat(3000) }), true);
});
