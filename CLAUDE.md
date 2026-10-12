@AGENTS.md

## Which model to use (owner rule, Oct 12: save usage without lowering Mila's quality)
- **Haiku 5.5 is fine for:** running the checks (`npx tsc --noEmit`, `npx eslint src --quiet`, `node --import tsx --test tests/*.test.mts tests/*.test.ts`, `node --import tsx tests/qa/run.mts`), committing and pushing, editing docs and copy, reading logs, collecting failures from the question bank, adding a test for an already-decided behavior.
- **Use Sonnet 5.5 for:** anything in `src/lib/agent` (intents, nlu, engine, handlers), approvals, billing, credits, auth, calendar and email sync, migrations, anything that touches user data or money.
- **Never lower quality to save usage:** if a change is not clearly mechanical, stop and say it needs Sonnet. Do not loosen a test to make it pass.
- Deploys: one push per batch of fixes (Vercel rate limits). The owner has standing permission to merge and push to main.
