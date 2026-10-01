import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { TABLES } from "@/lib/types";

// Everything Mila stores about the signed-in user, as JSON (OAuth tokens excluded).
export const GET = api(async ({ profile }) => {
  const store = getStore();
  const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
  for (const t of TABLES) {
    const rows = await store.list(t, profile.id);
    out[t] = t === "integrations" ? rows.map(({ token_encrypted, ...r }: any) => r) : rows;
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="mila-export.json"' } });
});
