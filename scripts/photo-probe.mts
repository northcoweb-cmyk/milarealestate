// Real-property test of the photo provider against live RentCast results. Needs RENTCAST_API_KEY + the provider key in your env.
//   PHOTO_PROVIDER=zillapi ZILLAPI_API_KEY=... RENTCAST_API_KEY=... npx tsx scripts/photo-probe.mts "Austin" TX [count=10]
// Spends real provider credits (about 4 per home). Does NOT touch your database: it calls the provider directly.
import { newListings, rentcastConfigured } from "../src/lib/listing-data/rentcast.ts";
import { PROVIDERS, providerName } from "../src/lib/media/providers/index.ts";
import { addressKey } from "../src/lib/media/address.ts";

const [city, state, countArg] = process.argv.slice(2);
const count = Math.min(Number(countArg) || 10, 25);
if (!city || !state) { console.error('usage: npx tsx scripts/photo-probe.mts "City" ST [count]'); process.exit(1); }
if (!rentcastConfigured()) { console.error("RENTCAST_API_KEY is not set."); process.exit(1); }
const provider = PROVIDERS[providerName()];
if (!provider?.configured()) { console.error(`${providerName()} key is not set.`); process.exit(1); }

const listings = (await newListings({ city, state, limit: count, days: 60 })).slice(0, count);
console.log(`provider=${provider.key}  homes=${listings.length}\n`);
const rows: Record<string, unknown>[] = [];
for (const l of listings) {
  const t0 = Date.now();
  let r: Record<string, unknown>;
  try {
    const out = await provider.fetchPhotos({ address: l.address, city: l.city, state: l.state, zip: l.zip, listingId: l.id });
    r = { photos: out.photos.length, providerId: out.providerPropertyId, first: out.photos[0]?.url ?? "", units: out.requests.reduce((n, x) => n + x.units, 0), match: "exact (address verified)" };
  } catch (e: any) {
    r = { photos: 0, providerId: "", first: "", units: (e.requests ?? []).reduce((n: number, x: any) => n + x.units, 0), match: `FAILED: ${e.code ?? "error"} ${e.message}` };
  }
  rows.push({ rentcastListingId: l.id, address: `${l.address}, ${l.city}, ${l.state} ${l.zip}`, key: addressKey(l), ...r, ms: Date.now() - t0 });
}
console.table(rows.map(({ key: _k, ...x }) => x));
const ok = rows.filter((r) => (r.photos as number) > 0).length;
console.log(`\n${ok}/${rows.length} homes returned photos; ${rows.reduce((n, r) => n + (r.units as number), 0)} provider credits used.`);
console.log("MANUAL STEP: open each 'first' URL next to the real listing and confirm it is the same house. The script verifies the address string matches; only you can confirm the picture.");
