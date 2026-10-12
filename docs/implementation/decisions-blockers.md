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

## Open defects from the eval pass (see eval-failures.md)
- Wrong-building photos: `pullListingPhotos` (src/lib/images/listing.ts) attaches photos from any pasted link without checking the address. Not fixed.
- Multi-day out-of-office is one long event; no all-day or recurring event type (disclosed in replies).
- Spoken ordinal "the thirty first" parses as today.
- Double-tap parallel turns share state, lightly tested.
- `decideApproval` for send_email really sends via Gmail/Outlook when connected, but the buttons say "Open in email app"/"Approve draft": label needs a decision.

## Decisions made Oct 12 (owner)
- Pinch zoom stays off. Google + Microsoft sign-in in for launch (Google for login; Microsoft for calendar/mail connection). Voice in, and Mila needs a spoken voice. Photos from pasted links in, capped at 5 per link.
- Calendar sync is add-only: Mila writes to a connected calendar and never reads it (reading is behind CALENDAR_PULL=1). Tradeoff: she can't see events made elsewhere, so she can't warn about overlaps with them.
- Refunds: none once 100+ credits are used.
- **Open risk: Zillow / Redfin / Realtor links.** The code deliberately refuses big portals (PORTALS in src/lib/images/listing.ts) because their terms forbid automated access and listing photos are usually copyrighted. Removing that is a legal/terms risk the owner has to accept knowingly; I have not removed it. Safer options: (1) pull from agent/brokerage sites and public pages, (2) upload photos directly, (3) always fall back to the Street View image so every property has at least one photo.

## Decisions Oct 12 (evening)
- Annual plan: YES. $490/yr (two months free), same monthly credits delivered every month (checked against Stripe monthly), 500 bonus credits as the founding-member perk, AI ceiling $12/mo. Built; needs a live Stripe test.
- No launch promo code. A public discount code comes later when the free trial is removed.
- Seat cap stays 25. Google Cloud billing: upgrade 2–3 days before launch, but only if the trial end date allows (check the console: if the trial ends first, Street View stops).
- Zillow/Redfin: stays blocked; users now get a clear explanation plus what to do instead (upload photos or paste a brokerage page; Street View fills in).
- Bright MLS (and other MLSs): data is licensed to the MLS's members and approved vendors, not something we can read from an address or a pasted link. Real route = apply to Bright MLS for vendor data access (needs a license agreement and usually broker sign-off), a post-launch project. Interim: let agents upload the MLS listing sheet PDF/photos and have Mila read it (to build/verify).
