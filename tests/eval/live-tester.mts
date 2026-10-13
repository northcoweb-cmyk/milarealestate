// AI tester: one model plays a busy agent texting Mila, another model judges every reply, and the failures are written up as a bug report.
// Mila runs for real (her own rules plus the real model fallback) against a throwaway account. Nothing here touches production data.
//
//   OPENAI_API_KEY=sk-... node --import tsx tests/eval/live-tester.mts --scenario=chicago --turns=14 --max-usd=0.60
//   --scenario=all runs every scenario. Report: tests/eval/live-report.md (paste it to Claude, same shape as the Mila OS daily export).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const maxUsd = Number(arg("max-usd", "0.60")), maxTurns = Number(arg("turns", "12")), which = arg("scenario", "chicago");
const outFile = arg("out", path.join(path.dirname(new URL(import.meta.url).pathname), "live-report.md"));
if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) { console.error("Set OPENAI_API_KEY (or ANTHROPIC_API_KEY) first. It is only used for this run."); process.exit(1); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-live-"));
process.env.MILA_DATA_DIR = dir;
const { createTestStore } = await import("../../src/lib/db/store");
const store: any = createTestStore(dir, true);
const { createProfile } = await import("../../src/lib/users");
const { handleTurn } = await import("../../src/lib/agent/engine");
const { getProvider, estimateCost } = await import("../../src/lib/ai/provider");
const { fmtDayTime } = await import("../../src/lib/time");

const TZ = "America/Chicago";
const SCENARIOS: Record<string, { name: string; goal: string }> = {
  chicago: { name: "Chicago rental day", goal: "You are showing Chicago apartment rentals. Real addresses: 347 W Chestnut St Unit 2611 Chicago IL 60610; 765 W Adams St Chicago IL 60661; 506 W Deming Pl Chicago IL 60614. Do this in order, in your own words: check today's calendar; add a new client Maya Brooks (312-555-0142, maya.brooks@example.com, wants a 1 bed rental in the West Loop under $2,600); ask what's active at those buildings; book showings with Maya at those three addresses tomorrow afternoon (4pm, 5:15pm) and Thursday 11am; ask what tomorrow looks like; move one showing 30 minutes; ask Mila to text and email Maya the schedule; log a call where Maya loved Chestnut and wants to apply Friday; cancel the Thursday one; then tell Mila Maya signed with another realtor; clear her calendar; take her off your active clients; tell Mila you're out of office Friday through Sunday and ask what you need to do before you leave." },
  openhouse: { name: "Open house day", goal: "You have an open house today at 12 Elm St Chicago IL 60614, 1pm to 3pm. Ask Mila to put it on the calendar if it's not there, ask what time it starts, say it went great, ask what you need to know for this week, get a thank-you email to everyone who came and an Instagram post, then ask who to follow up with." },
  messy: { name: "Messy real speech", goal: "You type fast with typos and shorthand (tmrw, w/, 2ish, ppl). Book lunch with Dana tmrw noon, a showing sat 2ish at 88 Birch Ave Chicago IL 60622, change your mind on the time twice, cancel something, ask 'whats next', say 'yes' and 'no' at random moments, and ask a vague question like 'what should i do today'." },
  oof: { name: "Out of office week", goal: "You will be out of the office next Monday to Friday. Tell Mila, ask what you must do before leaving, have two showings already booked for Tuesday and Wednesday and see how Mila handles them, ask her to move them, and ask for an out-of-office email draft." },
  seller: { name: "Listing launch", goal: "You just signed a listing agreement for 210 N Wells St Unit 1504 Chicago IL 60606, 2 bed 2 bath, $585,000. Ask Mila what's missing before you can go live, schedule a photographer Thursday 10am, an open house Sunday 1-3pm, make posts, and draft an email to your contacts." },
  confused: { name: "Confused new user", goal: "You're new and not sure what Mila can do. Ask what she can do, try a vague request, then a clear one, then something she probably can't do (e.g. 'file my taxes', 'send a text for me'), then ask who you haven't talked to lately and how much credit you have left." },
};

let spent = 0;
const provider = getProvider();
async function ask(system: string, history: { role: "user" | "assistant"; content: string }[], json?: object): Promise<string> {
  const r = await provider.complete({ tier: "fast", system, messages: history, maxTokens: 500, ...(json ? { jsonSchema: json as any } : {}) });
  spent += estimateCost(r.info, r.usage.inputTokens, r.usage.outputTokens);
  return json ? JSON.stringify(r.json ?? {}) : r.text;
}
const JUDGE_SCHEMA = { name: "verdict", description: "Judge Mila's reply", schema: { type: "object", properties: { verdict: { type: "string", enum: ["pass", "fail"] }, severity: { type: "string", enum: ["low", "medium", "high"] }, problem: { type: "string" }, expected: { type: "string" } }, required: ["verdict"] } };

const bugs: { scenario: string; n: number; said: string; mila: string; problem: string; expected: string; severity: string; transcript: string }[] = [];
const ids = which === "all" ? Object.keys(SCENARIOS) : [which];
for (const id of ids) {
  const sc = SCENARIOS[id]; if (!sc) { console.error(`Unknown scenario ${id}. Options: ${Object.keys(SCENARIOS).join(", ")}, all`); process.exit(1); }
  const email = `ai-tester-${id}-${Date.now()}@test.dev`;
  const prof0 = await createProfile({ email, full_name: "Sarah Carter" });
  await store.update("profiles", prof0.id, prof0.id, { timezone: TZ, location: "Chicago, IL", primary_market: "Chicago, IL", onboarded: true });
  const profile = await store.get("profiles", prof0.id, prof0.id);
  const convo: { role: "user" | "assistant"; content: string }[] = [];
  const log: string[] = [];
  console.log(`\n=== ${sc.name} ===`);
  for (let n = 1; n <= maxTurns && spent < maxUsd; n++) {
    const persona = await ask(`You are a busy US real estate agent texting your AI assistant, Mila. Today is ${fmtDayTime(new Date(), TZ)} (${TZ}). Your plan: ${sc.goal}\nWrite ONLY your next single message, exactly as a real agent types it on a phone (short, casual). Do the plan step by step across messages, reacting to what Mila said. If the plan is finished, reply exactly DONE.`, [{ role: "user", content: "Start." }, ...convo]);
    const said = persona.trim().replace(/^["“]|["”]$/g, "");
    if (!said || /^DONE\b/i.test(said)) break;
    let reply = "";
    try { const r = await handleTurn(profile, { message: said }); reply = r.milaMessage.content + (r.milaMessage.blocks?.length ? `\n[cards: ${r.milaMessage.blocks.map((b: any) => b.type + (b.title ? `: ${b.title}` : "")).join(", ")}]` : ""); } catch (e) { reply = `ERROR THROWN: ${(e as Error).message}`; }
    convo.push({ role: "assistant", content: said }, { role: "user", content: reply }); // roles flipped: the persona is "assistant" in its own history
    log.push(`Agent: ${said}`, `Mila: ${reply.replace(/\n+/g, " ")}`);
    const evs = (await store.list("calendar_events", profile.id)).filter((e: any) => e.status === "confirmed").sort((a: any, b: any) => a.start_at.localeCompare(b.start_at)).map((e: any) => `${e.title} @ ${fmtDayTime(e.start_at, TZ)}`);
    const people = (await store.list("contacts", profile.id)).map((c: any) => `${c.name} (${c.status})`);
    const verdict = JSON.parse(await ask(`You are a strict QA reviewer for "Mila", an AI operations manager for real estate agents. Judge ONLY Mila's last reply to the agent's last message.\nFAIL if: she misunderstands or ignores part of the request; invents facts (listings, prices, availability) she can't know; gets a date, time or time zone wrong (agent is in ${TZ}, now is ${fmtDayTime(new Date(), TZ)}); says she did something that is not reflected in the saved state below; asks again for information already given; gives a generic "I'm not sure how to do that" menu for a reasonable request; loops; is robotic, wrong in tone, or unhelpful; or misses an obvious next step a great assistant would offer. PASS if it's correct, honest and useful (asking one good clarifying question is fine).\nSaved state now. Calendar: ${evs.join(" | ") || "empty"}. Contacts: ${people.join(" | ") || "none"}.`, [{ role: "user", content: `Recent conversation:\n${log.slice(-8).join("\n")}\n\nJudge Mila's last reply.` }], JUDGE_SCHEMA));
    const tag = verdict.verdict === "fail" ? `FAIL(${verdict.severity ?? "?"})` : "ok";
    console.log(`${String(n).padStart(2)}. ${tag}  ${said.slice(0, 70)}`);
    if (verdict.verdict === "fail") bugs.push({ scenario: sc.name, n, said, mila: reply, problem: verdict.problem ?? "", expected: verdict.expected ?? "", severity: verdict.severity ?? "medium", transcript: log.slice(-8).join("\n") });
  }
}
// Mila's own AI use during the run, from the usage ledger
let milaCost = 0; for (const u of await store.listAll("usage")) milaCost += Number(u.est_cost_usd ?? 0);
const total = spent + milaCost;
const md = [`# AI tester report`, ``, `Scenarios: ${ids.join(", ")} · bugs found: ${bugs.length} · estimated cost: $${total.toFixed(3)} (tester+judge $${spent.toFixed(3)}, Mila $${milaCost.toFixed(3)}, cap $${maxUsd})`, ``, `## What to do with this`, `For each bug: reproduce with the harness or the question bank, write a failing regression test first, fix the root cause, run the full checks, and ship all fixes in one push. The judge is an AI and can be wrong: say so when a "bug" is actually fine.`, ``,
  ...bugs.map((b, i) => [`## ${i + 1}. [${b.severity}] ${b.scenario}, step ${b.n}`, `- Agent said: ${b.said}`, `- Mila said: ${b.mila.replace(/\n+/g, " ")}`, `- Problem: ${b.problem}`, `- Expected: ${b.expected}`, `- Conversation:`, ...b.transcript.split("\n").map((l) => `  - ${l}`), ``].join("\n"))].join("\n");
fs.writeFileSync(outFile, md);
console.log(`\n${bugs.length} bugs. Report: ${outFile}. Estimated cost $${total.toFixed(3)}.`);
process.exit(0);
