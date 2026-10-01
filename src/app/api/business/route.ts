import { api, readJson } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

export const GET = api(async ({ profile }) => {
  const b = (await getStore().list("businesses", profile.id))[0] ?? null;
  return { business: b };
});

export const PUT = api(async ({ profile, req }) => {
  const body = await readJson(req);
  const store = getStore();
  const data = { name: String(body.name ?? "").slice(0, 120), license_state: body.license_state ? String(body.license_state).slice(0, 2).toUpperCase() : null, signature: body.signature ? String(body.signature).slice(0, 600) : null, service_areas: Array.isArray(body.service_areas) ? body.service_areas.map((s: unknown) => String(s).slice(0, 80)).slice(0, 30) : [] };
  const cur = (await store.list("businesses", profile.id))[0];
  return { business: cur ? await store.update("businesses", profile.id, cur.id, data) : await store.insert("businesses", profile.id, data) };
});
