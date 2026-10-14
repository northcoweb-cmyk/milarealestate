import { getStore } from "./db/store";
import { isTester } from "./testers";

/** How many real customer accounts may exist right now (launch limit). Raise SEAT_CAP in Vercel as launch goes well. Test accounts and demos don't count. */
export const seatCap = () => { const n = Number(process.env.SEAT_CAP ?? 25); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 25; };

export async function seatsLeft(): Promise<{ taken: number; cap: number; open: boolean }> {
  const taken = (await getStore().listAll("profiles")).filter((p) => !p.is_demo && !isTester(p.email)).length;
  const cap = seatCap();
  return { taken, cap, open: taken < cap };
}
