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
/** People already on the list. Used to decide whether a new signup is inside the launch cap or goes to the queue. */
export async function countEntries(): Promise<number | null> {
  try {
    const r = await fetch(`${base()}/rest/v1/waitlist?select=id`, { method: "HEAD", headers: headers({ Prefer: "count=exact" }), cache: "no-store", signal: AbortSignal.timeout(8000) });
    const m = /\/(\d+)$/.exec(r.headers.get("content-range") ?? "");
    return r.ok && m ? Number(m[1]) : null;
  } catch { return null; }
}
export async function insertEntry(row: { email: string; name: string | null; source: string | null; status?: "waiting" | "queued" }) {
  const r = await fetch(`${base()}/rest/v1/waitlist`, { method: "POST", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify({ ...row, status: row.status ?? "waiting" }), signal: AbortSignal.timeout(10000) });
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

/** Shared daily counter for the Ask Mila box (needs migration 0007). Returns null when it isn't set up, and the caller falls back to a stricter in-memory cap. */
export async function bumpSiteChat(day: string): Promise<number | null> {
  if (!dbConfigured()) return null;
  const r = await fetch(`${base()}/rest/v1/rpc/bump_site_chat`, { method: "POST", headers: headers(), body: JSON.stringify({ p_day: day }), signal: AbortSignal.timeout(5000), cache: "no-store" });
  if (!r.ok) return null;
  const n = await r.json();
  return typeof n === "number" ? n : null;
}

// ---- creator partner program (the private page a creator uses to send their video links)
export interface CreatorRow { id: string; name: string; status: "invited" | "active" | "rewarded" | "expired" | "declined"; deadline_at: string | null; reward_ends_at: string | null }
export interface CreatorVideoRow { id: string; url: string; status: "submitted" | "verified" | "changes" | "rejected"; note: string | null; views: number | null }
const sbGet = async <T,>(path: string): Promise<T | null> => {
  try { const r = await fetch(`${base()}/rest/v1/${path}`, { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(10000) }); return r.ok ? ((await r.json()) as T) : null; } catch { return null; }
};
export async function creatorByToken(token: string): Promise<CreatorRow | null> {
  if (!/^[a-f0-9]{48}$/.test(token) || !dbConfigured()) return null;
  return (await sbGet<CreatorRow[]>(`creators?token=eq.${token}&select=id,name,status,deadline_at,reward_ends_at&limit=1`))?.[0] ?? null;
}
export async function creatorVideos(creatorId: string): Promise<CreatorVideoRow[]> {
  return (await sbGet<CreatorVideoRow[]>(`creator_videos?creator_id=eq.${encodeURIComponent(creatorId)}&select=id,url,status,note,views&order=created_at.asc`)) ?? [];
}
/** A new link, or a fixed link for a video that was sent back for changes (it goes back to "needs your check"). */
export async function addCreatorVideo(creatorId: string, url: string, platform: string, replaceId?: string) {
  if (replaceId) {
    const r = await fetch(`${base()}/rest/v1/creator_videos?id=eq.${encodeURIComponent(replaceId)}&creator_id=eq.${encodeURIComponent(creatorId)}&status=eq.changes`, { method: "PATCH", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify({ url, platform, status: "submitted", note: null, checks: {} }), signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`update ${r.status}`);
    return;
  }
  const r = await fetch(`${base()}/rest/v1/creator_videos`, { method: "POST", headers: headers(), body: JSON.stringify({ creator_id: creatorId, url, platform }), signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`insert ${r.status}`);
}
