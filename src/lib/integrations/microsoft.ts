/**
 * Microsoft adapter: sign-in with Outlook / Microsoft 365 (personal and work accounts) for mail and calendar.
 *
 * Needs MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET from an Entra app registration (see docs/knowledge-base/12-connections-setup.md).
 * Without them the UI says it needs setup; nothing is faked. NOTE: written against Microsoft's documented v2 endpoints
 * but not yet exercised against a live Microsoft account. Test with a real Outlook.com and a work account before launch.
 */
import { getStore } from "../db/store";
import type { Integration } from "../types";
import { decrypt, encrypt } from "./crypto";

export const MS_SCOPES = ["offline_access", "openid", "email", "User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite"];
export const microsoftConfigured = () => Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
export const msRedirectUri = () => `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/api/integrations/microsoft/callback`;
const TENANT = "common"; // personal Microsoft accounts and any work/school tenant

export function msAuthUrl(state: string) {
  const q = new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID!, response_type: "code", redirect_uri: msRedirectUri(), response_mode: "query", scope: MS_SCOPES.join(" "), state, prompt: "select_account" });
  return `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?${q}`;
}

interface Tokens { access_token: string; refresh_token?: string; expires_at: number }

export async function msExchangeCode(code: string) {
  const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.MICROSOFT_CLIENT_ID!, client_secret: process.env.MICROSOFT_CLIENT_SECRET!, redirect_uri: msRedirectUri(), grant_type: "authorization_code", scope: MS_SCOPES.join(" ") }),
  });
  if (!r.ok) throw new Error("Microsoft rejected the sign-in (" + r.status + ")");
  const d = (await r.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
  return { tokens: { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + d.expires_in * 1000 } as Tokens, scopes: (d.scope ?? "").split(" ").filter(Boolean) };
}

async function accountEmail(accessToken: string) {
  const r = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) return null;
  const d = (await r.json()) as { mail?: string | null; userPrincipalName?: string };
  return d.mail ?? d.userPrincipalName ?? null;
}

export async function msSaveConnection(userId: string, tokens: Tokens, scopes: string[]) {
  const store = getStore();
  const existing = (await store.list("integrations", userId)).find((i) => i.provider === "outlook");
  const email = await accountEmail(tokens.access_token);
  const prev = existing?.token_encrypted ? (JSON.parse(decrypt(existing.token_encrypted)) as Tokens) : null;
  const merged: Tokens = { ...tokens, refresh_token: tokens.refresh_token ?? prev?.refresh_token };
  const data = { provider: "outlook" as const, status: "connected" as const, account_label: email, scopes: scopes.length ? scopes : MS_SCOPES, token_encrypted: encrypt(JSON.stringify(merged)), error: null, connected_at: new Date().toISOString() } as Partial<Integration>;
  return existing ? store.update("integrations", userId, existing.id, data) : store.insert("integrations", userId, data as Omit<Integration, "id" | "user_id" | "created_at" | "updated_at">);
}

export async function disconnectMicrosoft(userId: string) {
  const store = getStore();
  for (const i of (await store.list("integrations", userId)).filter((x) => x.provider === "outlook")) await store.remove("integrations", userId, i.id);
}
