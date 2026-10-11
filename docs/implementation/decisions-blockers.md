# Decisions and blockers

## Needs your decision
1. **Pinch zoom.** Brief/accessibility says allow zoom; you earlier asked for no pinch zoom. I re-enabled zoom (`maximumScale: 5`). Say the word and I revert it.
2. **Deploy / push to main.** Brief requires explicit authorization. All work sits on `claude/compassionate-einstein-3qc5c8`. Pushing ~dozen commits at once to main risks the GitHub/Vercel rate limit seen Oct 10; I'd push once.
3. **Refund policy.** Intake button only. A promise of refund needs your/legal approval.
4. **Credit calibration.** Credit amounts per plan are provisional until real usage data exists. No margins are claimed.
5. **CRM choice.** Blocked on your pick.
6. **"Meta Muse" competitor** named in the brief is unresolved; I could not identify it, so no claims about it were written.
7. **GITHUB_BUG_REPO** must be a private repo; bug reports can include user context.

## Owner actions (I cannot do these)
- Apply `supabase/migrations/0012_lock_server_owned_tables.sql` to the live database.
- Provide/verify Stripe, Google, Gmail, Maps, model keys in Vercel for each project.
- Test on a real iPhone and Android.

## Known not done
See `status.md` NOT DONE rows.
