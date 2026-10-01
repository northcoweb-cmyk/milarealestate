import { api, bad, readJson } from "@/lib/server/route";
import { isAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db/store";
import type { AppConfig } from "@/lib/types";

// Business-owner controls: credit costs, plans and packs. Never hard-coded in the agent.
export const GET = api(async ({ profile }) => {
  if (!isAdmin(profile)) return Response.json({ error: "Not allowed." }, { status: 403 });
  return { config: await getStore().getConfig() };
});

export const PUT = api(async ({ profile, req }) => {
  if (!isAdmin(profile)) return Response.json({ error: "Not allowed." }, { status: 403 });
  const b = await readJson<{ config: AppConfig }>(req);
  const c = b.config;
  if (!c || typeof c.credit_costs !== "object" || !Array.isArray(c.plans) || !Array.isArray(c.packs)) throw bad("That configuration isn't valid.");
  for (const v of Object.values(c.credit_costs)) if (typeof v !== "number" || v < 0 || v > 10_000) throw bad("Credit costs must be numbers between 0 and 10,000.");
  await getStore().setConfig(c);
  return { ok: true };
});
