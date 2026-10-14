import { NextResponse } from "next/server";
import { clientIp, hit } from "@/lib/server/rate-limit";
import { referrerFirstName } from "@/lib/referral";

/** Public: the first name behind an invite code, so the sign-up page can say "Sarah invited you". Nothing else is exposed, and lookups are rate limited. */
export async function GET(req: Request) {
  if (!hit(`reflookup:${clientIp(req)}`, 30, 10 * 60_000)) return NextResponse.json({ error: "Slow down." }, { status: 429 });
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const name = await referrerFirstName(code);
  return NextResponse.json({ valid: !!name, name });
}
