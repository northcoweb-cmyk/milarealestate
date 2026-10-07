# Mila data pull: 100-request QA and data access (Oct 7)

## What was tested
100 requests a team real estate agent would send (rentals in any state, rent estimates, comps/pricing, property record and tax/last-sale, area safety/schools/walkability, client briefs, buyer matching, calendar, follow-ups, closings, content). Harness: `tests/qa100/`.

- Routing: 100/100 land on the right handler (12 router gaps found and fixed; plus 3 regressions caught by the full gate and fixed).
- Full gate (`scripts/felix.sh`): all green. 9 `clarify` scenarios fail identically on the previous commit; they are pre-existing and tolerated by the gate.
- Run against mocks. **Real data quality is unverified** until the keys below are live.

## What Mila can pull now
| Need | Source | Status |
|---|---|---|
| Rentals/apartments for sale or rent, any US state | RentCast listings | needs `RENTCAST_API_KEY`; response shapes unverified |
| Rent estimate, value, property record, tax/last sale | RentCast | same |
| ZIP market stats | RentCast | same |
| Geocode, FEMA flood zone, neighborhood | Census geocoder, Nominatim, FEMA | free, verified live |
| Income/rent/population by tract | Census ACS | needs free `CENSUS_API_KEY` |
| Walk Score | Walk Score | needs `WALKSCORE_API_KEY` |
| Schools, crime, reviews, amenities | web search tool, cited | model/tool access unverified |

`/api/health` now reports `census` and `walkscore` flags.

## Gaps (honest)
- No free national MLS/apartment feed. Zillow and Apartments.com have no public API. Real MLS needs a RESO/IDX feed through a broker.
- Schools and crime have no free structured source; they rely on cited web search.
- Not connected: Google Calendar/Gmail OAuth, CRM import.

## Cost and limits
- Free tier allows 10 listing searches per month (`MILA_TIER_LIMITS`). A research run can use several RentCast calls (about $0.074 each, max 8 per run), so raise this before launch.
- Unverified on your account: GPT-6 model access (falls back to gpt-4o), RentCast rental/AVM/market shapes, `web_search` tool name.

## Next
1. Add `CENSUS_API_KEY` and `WALKSCORE_API_KEY` (both free) in Vercel.
2. Hit `/api/health` after the next deploy; run 5 real apartment searches and check the numbers.
3. Hold `main` until deploys work.
