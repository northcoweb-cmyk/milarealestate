import { api, bad, notFound, readJson } from "@/lib/server/route";
import { isAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db/store";
import { getBalance, grantCredits } from "@/lib/credits";

// Owner tool: set a user's credit balance to an exact number (recorded in the ledger as an adjustment).
export const POST = api(async ({ profile, req }) => {
  if (!isAdmin(profile)) return Response.json({ error: "Not allowed." }, { status: 403 });
  const b = await readJson<{ user_id: string; balance: number }>(req);
  const target = Math.round(Number(b.balance));
  if (!Number.isFinite(target) || target < 0 || target > 10_000_000) throw bad("Enter a balance between 0 and 10,000,000.");
  if (!(await getStore().get("profiles", b.user_id, b.user_id))) throw notFound("That user");
  const cur = await getBalance(b.user_id);
  if (target !== cur) await grantCredits(b.user_id, target - cur, "adjust", `Owner set balance to ${target}`);
  return { balance: target };
});
