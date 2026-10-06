// Read-only access to the Mila database over Supabase's REST API. Server-only: the service-role key never reaches the browser.
const base = () => (process.env.SUPABASE_URL ?? "").trim().replace(/\/(rest|auth|storage)(\/v1.*)?\/*$/i, "").replace(/\/+$/, "");
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const configured = () => !!base() && !!key();

export type Row = Record<string, unknown>;

/** Fetch a table (all pages, up to `max` rows). A table that doesn't exist yet comes back as `null` so one missing migration never breaks the dashboard. */
export async function table<T = Row>(name: string, opts: { select: string; filter?: string; order?: string; max?: number }): Promise<T[] | null> {
  if (!configured()) return null;
  const out: T[] = [];
  const page = 1000, max = opts.max ?? 20000;
  for (let from = 0; from < max; from += page) {
    const qs = [`select=${encodeURIComponent(opts.select)}`, opts.filter ?? "", opts.order ? `order=${opts.order}` : ""].filter(Boolean).join("&");
    const r = await fetch(`${base()}/rest/v1/${name}?${qs}`, { headers: { apikey: key(), Authorization: `Bearer ${key()}`, Range: `${from}-${from + page - 1}`, "Range-Unit": "items" }, cache: "no-store", signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!r) return from === 0 ? null : out;
    if (r.status === 404 || r.status === 400) return from === 0 ? null : out;
    if (!r.ok) return from === 0 ? null : out;
    const rows = (await r.json()) as T[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}
