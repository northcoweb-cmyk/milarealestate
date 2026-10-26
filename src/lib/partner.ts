import { getStore } from "./db/store";
import { supabaseUrl } from "./supabase-url";

/**
 * Creator partners. A partner has a sign-up code (kept in the creators table that Mila OS manages). People who sign up with it are remembered on their profile,
 * and every payment they make is written down there, so the commission statement in Mila OS is exact. Reads fail quietly: sign-up and billing never depend on this.
 */
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const headers = () => ({ apikey: key(), Authorization: `Bearer ${key()}` });
const enabled = () => !!supabaseUrl() && !!key();

export interface PartnerRef { id: string; name: string; email?: string }
export async function partnerByCode(code: string): Promise<PartnerRef | null> {
  const c = String(code ?? "").trim().toUpperCase();
  if (!enabled() || !/^[A-Z0-9]{6,12}$/.test(c)) return null;
  try {
    const r = await fetch(`${supabaseUrl()}/rest/v1/creators?ref_code=eq.${encodeURIComponent(c)}&status=in.(partner,paused)&select=id,name,email&limit=1`, { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    return ((await r.json()) as PartnerRef[])[0] ?? null;
  } catch { return null; }
}

/** One payment from someone a partner referred: the amount before tax, once per payment id. */
export async function recordPartnerPayment(userId: string, cents: number | null | undefined, plan: string | null | undefined, ref: string): Promise<void> {
  if (!cents || cents <= 0) return;
  try {
    const store = getStore();
    const p = await store.get("profiles", userId, userId);
    const partner = p?.settings?.referral?.partner;
    if (!p || !partner?.id) return;
    const payments = partner.payments ?? [];
    if (payments.some((x) => x.ref === ref)) return;
    await store.update("profiles", userId, userId, { settings: { ...p.settings, referral: { ...(p.settings.referral ?? {}), partner: { ...partner, payments: [...payments, { at: new Date().toISOString(), cents: Math.round(cents), plan: plan ?? undefined, ref }].slice(-40) } } } } as never);
  } catch { /* billing must never fail because of this */ }
}
