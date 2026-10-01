import { NextResponse } from "next/server";
import { authMode, createProfile, localAuthAllowed, setLocalSession } from "@/lib/auth";
import { getStore } from "@/lib/db/store";
import { seedDemoData } from "@/lib/db/seed";

/** Explore Mila as "Sarah Carter" with clearly fictional data. Local mode only. */
export async function POST() {
  if (authMode() === "supabase" || !localAuthAllowed()) return NextResponse.json({ error: "Demo mode isn't available on this server." }, { status: 403 });
  const store = getStore();
  const email = "sarah.carter@demo.mila.app";
  let p = await store.findProfileByEmail(email);
  if (!p) p = await createProfile({ email, full_name: "Sarah Carter", demo: true });
  p = (await store.update("profiles", p.id, p.id, { onboarded: true, role: "Agent", brokerage: "Demo Realty (fictional)", location: "Gaithersburg, MD", primary_market: "Montgomery County, MD", experience: "growing", business_type: "mixed", is_demo: true }))!;
  await seedDemoData(p);
  await setLocalSession(p.id);
  return NextResponse.json({ ok: true });
}
