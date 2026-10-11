# Continuation

Resume from `status.md`. Order of remaining work: (1) interpretation layer with original-vs-normalized input retained (`src/lib/agent/engine.ts` `runText` pronoun rewrite); (2) property evidence ledger and correction-safe refresh; (3) calendar sync op/retry persistence; (4) scoped preference learning (`src/lib/agent/handlers/learn.ts`); (5) grounded daily plan (`debrief.ts`); (6) Home commitments card; (7) cost ledger categories + usage preview.

Gates: `npx tsc --noEmit`; `npx eslint src --quiet`; `node --import tsx --test tests/*.test.mts tests/*.test.ts`; `node --import tsx tests/qa/run.mts`. Never mark launch-ready without device tests and live checkout test.
