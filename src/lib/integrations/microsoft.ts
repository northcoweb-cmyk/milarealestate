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

// ---------------------------------------------------------------- Outlook mail (Microsoft Graph)
export class MicrosoftError extends Error {
  constructor(public code: "not_connected" | "reauth" | "api", message: string) { super(message); }
}

async function msAccessToken(userId: string): Promise<string> {
  const store = getStore();
  const row = (await store.list("integrations", userId)).find((i) => i.provider === "outlook" && i.status === "connected");
  if (!row?.token_encrypted) throw new MicrosoftError("not_connected", "Outlook isn't connected yet.");
  const t = JSON.parse(decrypt(row.token_encrypted)) as Tokens;
  if (t.expires_at > Date.now() + 60_000) return t.access_token;
  const fail = async () => { await store.update("integrations", userId, row.id, { status: "error", error: "Outlook needs permission again." }); throw new MicrosoftError("reauth", "Outlook needs permission again."); };
  if (!t.refresh_token) return fail();
  const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID!, client_secret: process.env.MICROSOFT_CLIENT_SECRET!, refresh_token: t.refresh_token, grant_type: "refresh_token", scope: MS_SCOPES.join(" ") }),
  });
  if (!r.ok) return fail();
  const d = (await r.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  const next: Tokens = { access_token: d.access_token, refresh_token: d.refresh_token ?? t.refresh_token, expires_at: Date.now() + d.expires_in * 1000 };
  await store.update("integrations", userId, row.id, { token_encrypted: encrypt(JSON.stringify(next)) });
  return next.access_token;
}

async function graph(userId: string, path: string, init: RequestInit = {}) {
  const token = await msAccessToken(userId);
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, "content-type": "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (r.status === 401 || r.status === 403) throw new MicrosoftError("reauth", "Outlook needs permission to do that. Reconnect and approve access.");
  if (!r.ok) throw new MicrosoftError("api", `Outlook returned ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 202 || r.status === 204 ? null : r.json();
}

export const outlookConnected = async (userId: string) => (await getStore().list("integrations", userId)).some((i) => i.provider === "outlook" && i.status === "connected");

export const outlook = {
  /** Sends from the agent's own Outlook mailbox. Graph returns no message id for sendMail, so none is reported. */
  send: async (userId: string, to: string[], subject: string, body: string) => {
    await graph(userId, "/me/sendMail", { method: "POST", body: JSON.stringify({ message: { subject, body: { contentType: "Text", content: body }, toRecipients: to.map((address) => ({ emailAddress: { address } })) }, saveToSentItems: true }) });
    return { id: null as string | null };
  },
  /** Recent messages to or from one address, newest first (for the contact card). */
  withPerson: async (userId: string, email: string, max = 10) => {
    const safe = email.replace(/["\\]/g, "");
    const d = (await graph(userId, `/me/messages?$top=${max}&$select=subject,from,toRecipients,receivedDateTime,bodyPreview&$search="${encodeURIComponent(safe)}"`)) as { value?: { subject?: string; from?: { emailAddress?: { address?: string } }; receivedDateTime?: string; bodyPreview?: string }[] };
    return (d.value ?? []).map((m) => ({ subject: m.subject ?? "(no subject)", fromThem: (m.from?.emailAddress?.address ?? "").toLowerCase() === email.toLowerCase(), at: m.receivedDateTime ?? "", snippet: (m.bodyPreview ?? "").slice(0, 200) }));
  },
};
