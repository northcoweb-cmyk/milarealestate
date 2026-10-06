# Tech notes

**Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Supabase, Vercel (https://milarealestate.vercel.app). Branch claude/compassionate-einstein-3qc5c8; main deploys.

**Run the gate:** `bash scripts/felix.sh` (types, lint, tests, 1,800-scenario QA, build). Never ship red.

**Env knobs:** MILA_DAILY_AI_BUDGET_USD (default 40), MILA_AI_DISABLED=1 (kill switch), MILA_TRIALS=1, MILA_MAX_OUTPUT_TOKENS, MILA_MAX_INPUT_CHARS, MILA_DEV_AI_BUDGET_USD, GOOGLE_MAPS_API_KEY, ADMIN_EMAILS.

**AI cost protection:** per-user monthly and daily USD caps by plan, global daily cap, size and token limits, graceful fallback to the rule-based engine with a one-time notice.

**Migrations:** 0003 (error_logs) and 0004 (listing_media_cache, api_usage) have been run in Supabase.

**Agents:** see .claude/agents/README.md. Run only the ones the change calls for.

**Lessons:** never chain a type-check into a push; never expose keys in public endpoints; the client router cache can show a stale signed-out redirect, so use full page loads after auth changes.
