# Mila evaluation spec

What the realistic evaluation measures, how it measures it, and what it is NOT.

## Read this first: mocked, deterministic, not a live-model run

- The agent under test is the **rule-based engine** (`src/lib/agent`). No model key is set, no network call is made, no provider is contacted. Replies are therefore deterministic.
- The clock is mocked per scenario (`globalThis.__milaNow`), the store is a local file store in a temp directory, and every scenario gets a fresh user. Time zones tested: New York, Chicago, Denver, Los Angeles, Phoenix, Honolulu.
- Anything that needs a live service is simulated at the `fetch` boundary (Google Calendar timeout, RentCast listing feed) or marked `not_implemented`. **A pass here does not prove behaviour with the live model, real Gmail/Google, real devices or real photos.**
- UI / mobile quality is **not measurable here** (no browser). It is reported as such, never scored.
- Cost: the rule-based path spends $0 of model money and makes 0 AI calls. The runner reports credits metered (the product's own unit) and wall time per turn. These say nothing about live-model cost or latency.

## Files

| File | Purpose |
|---|---|
| `tests/eval/scenarios.mts` | The inventory. `golden-1`..`golden-25` first, in order, then everything else. |
| `tests/eval/s-heldout.mts`, `s-heldout2.mts`, `s-heldout3.mts` | Held-out scenarios (batches 1, 2, 3). |
| `tests/eval/s-tuned.mts`, `s-tuned2.mts`, `s-tuned3.mts` | Tuned scenarios (the rules were iterated against these; they are regression coverage). |
| `tests/eval/lib.mts` | Scenario types, session wrapper (mutable clock, several conversations), store helpers, universal per-turn checks. |
| `tests/eval/runner.mts`, `run.mts` | `runEval()` and the CLI. |
| `tests/eval.test.mts` | Runs the whole inventory under `node --import tsx --test`; fails only on implemented scenarios that fail. |
| `tests/eval/first-run.json` | First-run pass/fail of every held-out scenario, recorded before the fix for that batch. |
| `tests/eval/transcript.mts` | Debug helper: print one conversation. |
| `tests/qa/scenarios.mts` (end of file) | Randomised "real agent speech" generators for the existing QA harness (seeds 0-5). |

Run: `node --import tsx tests/eval/run.mts [id-or-category] [--held-out|--tuned] [--verbose] [--json out.json]`.

## What a scenario is

```ts
{ id, category, title, heldOut?, status?: "not_implemented", reason?, now?, tz?,
  setup?(s), turns: [{ say | act | run, expect?(reply, s), allow? }], assert?(s), dims: [...] }
```

Scenarios are multi-turn. Setup and `run` steps seed or edit the store directly (so a scenario about X is not polluted by the flow that creates Y). `assert` and `expect` read the **store** (calendar events, contacts, tasks, reminders, approvals, drafts, properties, memories, social posts, credit ledger, contact history, conversations), not just reply text. Reply text is checked only where wording is the point (honest status, a question was asked).

Every turn also gets the **universal checks**: the QA harness invariants (no double-booking, no past events, no unapproved contact deletes, ledger consistency, no `undefined`/`NaN`/template leaks, nothing marked sent without Gmail) plus: no "I sent / email sent / message sent" claim unless a draft is really `sent`, and no claim of having heard a call. A multi-day "Out of office" block is exempt from the 24-hour sanity check (the one deliberate long event).

## Dimensions

Each check is tagged with one dimension; a dimension's score is checks passed / checks run across implemented scenarios. A scenario passes only if all its checks pass.

| Dimension | What a check looks like |
|---|---|
| interpretation + entity selection | the right event/contact/property was chosen, right date/time parsed, no bleed between messages |
| necessary / unnecessary clarification | asked when two people/events match; did not ask when one does or everything was given |
| database / tool outcome correctness | the store ended up right (events, reminders, contacts, approvals, tenant isolation, ledger) |
| requested-subtask completion | every part of a multi-part request was done or reported (WHAT I DID block) |
| factual support / uncertainty | no invented price/features; categories kept separate; pulled data vs the agent's own numbers attributed |
| honest status wording | never "sent/canceled/done" when it was not; says what a limit is |
| draft usefulness | the draft says what was asked for, no template leaks |
| UI / mobile | not measurable here |
| latency | wall time per turn (local store, no network); p50/p95/max reported |
| cost | $0 model spend (rule-based); credits metered per turn reported |

## Held-out policy

- **Held-out** (`heldOut: true`) scenarios were written first, run once, and only then looked at. The parser/handlers are not tuned to their exact phrasings; their oracles are semantic and state-based so they stay valid whatever wording the agent uses.
- **Tuned** scenarios are the ones probed and iterated against.
- Held-out results are reported two ways: **first run** (before any fix made in response to that batch; stored in `tests/eval/first-run.json`) and **now** (after fixes). The first-run rate is the honest generalisation number. Once a held-out scenario has failed and been fixed it is, from then on, effectively a regression test; it keeps its `heldOut` flag so the first-run record stays attached to it.
- Batches: batch 1 (37) written before any fix. Batch 2 (22) written after batch 1 was fixed and run once before any change. Batch 3 (14) likewise after batch 2.
- Mistakes in my own oracles found on first inspection (a wrong expected UTC date, a too-narrow question detector, a regex that missed "not sure how", etc.) were corrected and are listed in `eval-failures.md`. Batch 1 is reported both as the very first run (21/37) and after those six oracle corrections (24/37), both before any agent change.

## not_implemented

Scenarios whose feature does not exist are written, marked `status: "not_implemented"` with a one-line reason, listed by the runner and by `tests/eval.test.mts`, and never counted as passes or failures:

- `golden-10` two sites agreeing from one syndicated origin: there is no evidence/provenance model for property facts.
- `golden-12` wrong-building photo: `pullListingPhotos` (`src/lib/images/listing.ts`, outside the agent lane) attaches photos from any pasted link without comparing the page's address to the property.

`golden-13` (voice) is implemented as a **text proxy** (dictation errors typed as text, e.g. "Pria Sha", "October thirty fifth"): there is no audio pipeline to test, only the browser's dictation feeding the same text path.

## Golden scenarios

`golden-1`..`golden-25` exist in order. Dedicated test files cover the same ground at the unit level: `tests/event-replacement.test.mts` (1), `tests/approval-binding.test.mts` (7), `tests/security-audit.test.mts` (19). The eval versions run through the chat engine on store state.

## Randomised speech generators (QA harness)

`tests/qa/scenarios.mts` now also draws, per seed, about 530 conversations of real agent speech with random clocks and zones: slang dates and spoken times (`speech_when`), messy addresses (`messy_addr`), pasted bulk imports (`bulk_paste`), "make me N posts" (`content_n`), reschedules in slang (`resched`), cancellations that must ask first (`cancel_ask`), ambiguous events and people that must produce one question and change nothing (`ambig_event`, `ambig_person`). Run: `QA_SEED=<0-5> node --import tsx tests/qa/run.mts all <out.json>`.

## Known limits of this evaluation

- Rule-based only; a live model changes wording and some routing, so this is a floor for the deterministic paths, not a ceiling or a forecast.
- Oracles encode my reading of the brief. Where a case is a matter of taste I avoided it; where I was wrong I fixed the oracle and said so.
- Single-user sequential conversations. Same-user parallel turns (a double tap) share conversation state and are only lightly covered by the existing `concurrency` QA category.
