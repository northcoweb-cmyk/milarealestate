# Mila implementation plan and status

Source: Mila Claude Code Implementation Brief (stages A–F). Branch: `claude/compassionate-einstein-3qc5c8`. Nothing here has been deployed. Nothing is production-verified.

Legend: DONE-LOCAL = implemented and covered by automated tests run locally (mocked store/AI, no live services). PARTIAL = some of it. NOT DONE = not started this pass.

## Stage A — foundations / documents
| Item | State |
|---|---|
| Plan/status doc (this file) | DONE |
| Capability matrix | DONE (`capabilities.md`, backed by `src/lib/capabilities.ts`, `/api/capabilities`) |
| Evaluation spec + failure inventory | DONE: `eval-spec.md`, `eval-failures.md`. 162 scenarios (160 implemented, all pass; 2 not_implemented: golden-10 evidence model, golden-12 wrong-building photos; golden-13 voice is a text proxy). Held-out first-run 49/73 (67%), pass after fixes. Mocked deterministic harness only |
| Decisions / blockers | DONE (`decisions-blockers.md`) |
| Continuation document | DONE (`continuation.md`) |

## Stage B — trust and safety of actions
| Item | State |
|---|---|
| Event replacement (create replacement first, cancel original second, rollback, undo, typed yes, corrections) | DONE-LOCAL, 14 tests |
| Approval binding (stale approvals refused, drafts never re-sent) | DONE-LOCAL, 4 tests |
| Entity ambiguity asks (property / contact) instead of guessing | DONE-LOCAL |
| Interrupted questions parked, "Still open" reminder, reconciliation card for multi-part requests | DONE-LOCAL |
| Honest comms wording (Approve draft, "Text marked sent by you", "Opened in your mail app") | DONE-LOCAL |
| Security/tenant audit | DONE-LOCAL, 10 tests; migration 0012 NOT applied (owner action) |

## Stage C — data and interpretation
| Item | State |
|---|---|
| Schema-validated interpretation layer + request tracing (original vs normalized input) | NOT DONE (pronoun rewrite in `runText` still replaces text) |
| Field-level property evidence ledger, price categories, refresh not overwriting user corrections | Ledger NOT DONE (golden-10). Refresh does not overwrite user edits (eval-tested); prep reply now attributes your numbers vs feed; the unverifiable claim "Anything you change is kept" was removed from the property page |
| External calendar sync ops/retry states, OAuth scope audit | PARTIAL: honest sync labels; Google failure after local save is disclosed with idempotent Retry sync; OAuth scope audit NOT done (`src/lib/calendar-sync.ts`) |
| Scoped preference learning (evidence count, recency, reset) | NOT DONE |
| Daily plan grounded with coverage disclosure | PARTIAL: morning plan discloses when only Mila's calendar is read |

## Stage D — product surface
| Item | State |
|---|---|
| Chat history (list, search, open, rename, delete with confirm) | DONE-LOCAL (API + UI); not device-tested |
| Read-aloud toggle | DONE-LOCAL; not device-tested |
| Support intake: expected/actual, transcript only with permission, PII redaction, problem classification | DONE-LOCAL |
| Onboarding shortened; first task prompt | DONE-LOCAL |
| Wording guardrails for fair-housing flags (non-blocking) | DONE-LOCAL, tests |
| Zoom/accessibility: pinch zoom re-enabled | DONE; CONFLICTS with earlier owner request, see decisions |
| Home "next appointment / commitments / suggested action" | NOT DONE |
| Voice clarification + speech metering | NOT DONE |

## Stage E — billing, cost
| Item | State |
|---|---|
| Trial reservation model (existing trial users never cut off by pool), admission gate | DONE-LOCAL, test |
| Legacy plan hidden; plan renamed "Mila" $49; credits labeled provisional | DONE-LOCAL |
| Refund request intake (no promise of refund) | DONE-LOCAL |
| Admin audited grant credits / extend trial | DONE-LOCAL (admin-os); typecheck only |
| Cost ledger by category + calibration dashboard | NOT DONE; no margins are claimed |
| "Expected charge" visibility before expensive work | NOT DONE |

## Stage F — release
| Item | State |
|---|---|
| Real-device testing | NOT DONE |
| Deploy | NOT DONE, by design. Needs your explicit go-ahead |
