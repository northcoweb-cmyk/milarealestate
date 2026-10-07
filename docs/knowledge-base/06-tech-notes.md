# Tech notes

**Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Supabase, Vercel (https://milarealestate.vercel.app). Branch claude/compassionate-einstein-3qc5c8; main deploys.

**Run the gate:** `bash scripts/felix.sh` (types, lint, tests, 1,800-scenario QA, build). Never ship red.

**Env knobs:** MILA_DAILY_AI_BUDGET_USD (default 40), MILA_AI_DISABLED=1 (kill switch), MILA_TRIALS=1, MILA_MAX_OUTPUT_TOKENS, MILA_MAX_INPUT_CHARS, MILA_DEV_AI_BUDGET_USD, GOOGLE_MAPS_API_KEY, ADMIN_EMAILS.

**AI cost protection:** per-user monthly and daily USD caps by plan, global daily cap, size and token limits, graceful fallback to the rule-based engine with a one-time notice.

**Migrations:** 0003 (error_logs) and 0004 (listing_media_cache, api_usage) have been run in Supabase.

**Agents:** see .claude/agents/README.md. Run only the ones the change calls for.

**Lessons:** never chain a type-check into a push; never expose keys in public endpoints; the client router cache can show a stale signed-out redirect, so use full page loads after auth changes.

## AI models (OpenAI path), Oct 7, 2026
- Tiers: fast = `gpt-6-luna` (routing, simple replies; $0.10 in / $0.50 out per 1M tokens), standard = `gpt-6.1-sol` (normal chat, drafts; $2 / $10), reasoning = `gpt-6-astra` (hard requests; $10 / $50). Research and vision use the standard model.
- GPT-6 models are called through the Responses API with a `reasoning.effort` setting. If a GPT-6 model is not available on the account, the code falls back to gpt-4o-mini / gpt-4o and logs a warning (`MILA_OPENAI_FALLBACK=0` turns the fallback off).
- Override with `MILA_OPENAI_MODEL_FAST`, `MILA_OPENAI_MODEL_STANDARD`, `MILA_OPENAI_MODEL_REASONING`. Setting all three to `gpt-6-astra` makes everything use the smartest model, at roughly 20 to 100 times the cost.
- Astra is used for client search briefs (`client_search`) and long or strategic questions. Each Astra turn is a fraction of a dollar, and the existing per-user and global AI budgets still apply.
- Client search briefs (several requirements for a client) route to a research handler (web search, requirements, trade-offs, a sourced shortlist, what is unverified). Follow-ups like "search for the specified criteria" continue that search.
- Fixed: "4-5 hours" or "2-3 miles" was being read as a 4 to 5 PM time range and booking a showing.
