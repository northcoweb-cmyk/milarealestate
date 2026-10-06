// Minimal Supabase REST helper. Server-only: the service-role key never reaches the browser.
const base = () => (process.env.SUPABASE_URL ?? "").trim().replace(/\/(rest|auth|storage)(\/v1.*)?\/*$/i, "").replace(/\/+$/, "");
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const dbConfigured = () => !!base() && !!key();

const headers = (extra: Record<string, string> = {}) => ({ apikey: key(), Authorization: `Bearer ${key()}`, "content-type": "application/json", ...extra });

export async function findByEmail(email: string) {
  const r = await fetch(`${base()}/rest/v1/waitlist?email=eq.${encodeURIComponent(email)}&select=id&limit=1`, { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`lookup ${r.status}`);
  return ((await r.json()) as { id: string }[])[0] ?? null;
}
export async function insertEntry(row: { email: string; name: string | null; source: string | null }) {
  const r = await fetch(`${base()}/rest/v1/waitlist`, { method: "POST", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify({ ...row, status: "waiting" }), signal: AbortSignal.timeout(10000) });
  if (r.status === 409) return { duplicate: true as const };
  if (!r.ok) throw new Error(`insert ${r.status}`);
  return { duplicate: false as const, id: ((await r.json()) as { id: string }[])[0]?.id };
}
export async function markEmailed(id: string) {
  await fetch(`${base()}/rest/v1/waitlist?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ email_sent_at: new Date().toISOString() }), signal: AbortSignal.timeout(10000) }).catch(() => null);
}

/** Read-only self-check for /api/health: can we reach the waitlist table, and are the launch-day columns there? Never writes, never returns data. */
export async function diagnose() {
  const probe = async (select: string) => {
    try {
      const r = await fetch(`${base()}/rest/v1/waitlist?select=${select}&limit=1`, { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (r.ok) return { ok: true as const, status: r.status, code: null as string | null };
      const j = (await r.json().catch(() => ({}))) as { code?: string };
      return { ok: false as const, status: r.status, code: j.code ?? null };
    } catch { return { ok: false as const, status: 0, code: "network" }; }
  };
  const basic = await probe("id,email,name,source,status");
  const launch = basic.ok ? await probe("invite_token,invited_at,email_sent_at,claimed_at") : null;
  return { table: basic.ok, tableError: basic.ok ? null : { status: basic.status, code: basic.code }, launchColumns: launch?.ok ?? false };
}
