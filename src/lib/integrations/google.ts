/**
 * Google adapter: OAuth + Gmail + Calendar + Contacts (People) + Sheets.
 *
 * Needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. Without them every call
 * returns a `not_connected` result and the UI shows "Connect" — nothing is
 * ever faked. NOTE: this module was written against Google's documented REST
 * APIs but could not be exercised against live Google in the build
 * environment; test with a real account before relying on it.
 */
import { getStore } from "../db/store";
import type { Integration } from "../types";
import { decrypt, encrypt } from "./crypto";

export const GOOGLE_SCOPES = {
  base: ["openid", "email"],
  calendar: ["https://www.googleapis.com/auth/calendar.events"],
  gmail: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"],
  contacts: ["https://www.googleapis.com/auth/contacts.readonly"],
  sheets: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
};
export type GoogleService = "calendar" | "gmail" | "contacts" | "sheets";

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const redirectUri = () => `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/api/integrations/google/callback`;

export function authUrl(services: GoogleService[], state: string) {
  const scopes = [...GOOGLE_SCOPES.base, ...services.flatMap((s) => GOOGLE_SCOPES[s])];
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(), response_type: "code",
    scope: scopes.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

interface Tokens { access_token: string; refresh_token?: string; expires_at: number }

export async function exchangeCode(code: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  if (!r.ok) throw new Error("Google rejected the sign-in (" + r.status + ")");
  const d = (await r.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
  return { tokens: { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + d.expires_in * 1000 } as Tokens, scopes: d.scope.split(" ") };
}

export async function accountEmail(accessToken: string) {
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  return r.ok ? ((await r.json()) as { email?: string }).email ?? null : null;
}

export async function saveConnection(userId: string, tokens: Tokens, scopes: string[]) {
  const store = getStore();
  const existing = (await store.list("integrations", userId)).find((i) => i.provider === "google");
  const email = await accountEmail(tokens.access_token);
  const prev = existing?.token_encrypted ? (JSON.parse(decrypt(existing.token_encrypted)) as Tokens) : null;
  const merged: Tokens = { ...tokens, refresh_token: tokens.refresh_token ?? prev?.refresh_token };
  const data = { provider: "google" as const, status: "connected" as const, account_label: email, scopes, token_encrypted: encrypt(JSON.stringify(merged)), error: null, connected_at: new Date().toISOString() };
  return existing ? store.update("integrations", userId, existing.id, data) : store.insert("integrations", userId, data);
}

export async function getGoogle(userId: string): Promise<(Integration & { hasScope: (s: GoogleService) => boolean }) | null> {
  const row = (await getStore().list("integrations", userId)).find((i) => i.provider === "google" && i.status === "connected");
  if (!row) return null;
  return Object.assign(row, { hasScope: (s: GoogleService) => GOOGLE_SCOPES[s].every((x) => row.scopes.includes(x)) || GOOGLE_SCOPES[s].some((x) => row.scopes.includes(x)) });
}

export async function disconnectGoogle(userId: string) {
  const store = getStore();
  for (const i of (await store.list("integrations", userId)).filter((x) => x.provider === "google")) {
    if (i.token_encrypted) {
      try {
        const t = JSON.parse(decrypt(i.token_encrypted)) as Tokens;
        await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(t.refresh_token ?? t.access_token), { method: "POST" });
      } catch { /* best effort */ }
    }
    await store.remove("integrations", userId, i.id);
  }
}

async function accessToken(userId: string): Promise<string> {
  const store = getStore();
  const row = (await store.list("integrations", userId)).find((i) => i.provider === "google" && i.status === "connected");
  if (!row?.token_encrypted) throw new GoogleError("not_connected", "Google isn't connected yet.");
  const t = JSON.parse(decrypt(row.token_encrypted)) as Tokens;
  if (t.expires_at > Date.now() + 60_000) return t.access_token;
  if (!t.refresh_token) {
    await store.update("integrations", userId, row.id, { status: "error", error: "Google needs permission again." });
    throw new GoogleError("reauth", "Google needs permission again.");
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: t.refresh_token, grant_type: "refresh_token" }),
  });
  if (!r.ok) {
    await store.update("integrations", userId, row.id, { status: "error", error: "Google needs permission again." });
    throw new GoogleError("reauth", "Google needs permission again.");
  }
  const d = (await r.json()) as { access_token: string; expires_in: number };
  const next: Tokens = { ...t, access_token: d.access_token, expires_at: Date.now() + d.expires_in * 1000 };
  await store.update("integrations", userId, row.id, { token_encrypted: encrypt(JSON.stringify(next)) });
  return next.access_token;
}

export class GoogleError extends Error {
  constructor(public code: "not_connected" | "reauth" | "api", message: string) { super(message); }
}

async function g(userId: string, url: string, init: RequestInit = {}) {
  const token = await accessToken(userId);
  const r = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, "content-type": "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (r.status === 401 || r.status === 403) throw new GoogleError("reauth", "Google needs permission to do that. Reconnect and approve access.");
  if (!r.ok) throw new GoogleError("api", `Google returned ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

// ---- Calendar
export interface GEvent { id: string; summary?: string; location?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; status?: string }

export const gcal = {
  list: async (userId: string, timeMin: string, timeMax: string) =>
    ((await g(userId, `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`)) as { items: GEvent[] }).items ?? [],
  insert: async (userId: string, e: { summary: string; location?: string | null; description?: string | null; start: string; end: string; tz: string }) =>
    (await g(userId, "https://www.googleapis.com/calendar/v3/calendars/primary/events", { method: "POST", body: JSON.stringify({ summary: e.summary, location: e.location ?? undefined, description: e.description ?? undefined, start: { dateTime: e.start, timeZone: e.tz }, end: { dateTime: e.end, timeZone: e.tz } }) })) as GEvent,
  patch: async (userId: string, id: string, e: { summary?: string; start?: string; end?: string; tz: string }) =>
    (await g(userId, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}`, { method: "PATCH", body: JSON.stringify({ summary: e.summary, start: e.start ? { dateTime: e.start, timeZone: e.tz } : undefined, end: e.end ? { dateTime: e.end, timeZone: e.tz } : undefined }) })) as GEvent,
  remove: async (userId: string, id: string) => g(userId, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}`, { method: "DELETE" }),
};

// ---- Gmail
function mime(to: string[], subject: string, body: string, from?: string) {
  const enc = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`);
  const lines = [from ? `From: ${from}` : null, `To: ${to.join(", ")}`, `Subject: ${enc(subject)}`, "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", Buffer.from(body).toString("base64")].filter((l) => l !== null);
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

export const gmail = {
  send: async (userId: string, to: string[], subject: string, body: string) =>
    (await g(userId, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw: mime(to, subject, body) }) })) as { id: string },
  createDraft: async (userId: string, to: string[], subject: string, body: string) =>
    (await g(userId, "https://gmail.googleapis.com/gmail/v1/users/me/drafts", { method: "POST", body: JSON.stringify({ message: { raw: mime(to, subject, body) } }) })) as { id: string },
  search: async (userId: string, q: string, max = 10) => {
    const list = (await g(userId, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(q)}`)) as { messages?: { id: string }[] };
    const out: { id: string; subject: string; from: string; date: string; snippet: string }[] = [];
    for (const m of list.messages ?? []) {
      const d = (await g(userId, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`)) as { snippet: string; payload: { headers: { name: string; value: string }[] } };
      const h = (n: string) => d.payload.headers.find((x) => x.name === n)?.value ?? "";
      out.push({ id: m.id, subject: h("Subject"), from: h("From"), date: h("Date"), snippet: d.snippet });
    }
    return out;
  },
};

// ---- Contacts (People API) & Sheets
export async function googleContacts(userId: string) {
  const d = (await g(userId, "https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,organizations,addresses&pageSize=500")) as { connections?: any[] };
  return (d.connections ?? []).map((p) => ({
    name: p.names?.[0]?.displayName as string | undefined,
    email: p.emailAddresses?.[0]?.value as string | undefined,
    phone: p.phoneNumbers?.[0]?.value as string | undefined,
    location: p.addresses?.[0]?.formattedValue as string | undefined,
  })).filter((c) => c.name || c.email);
}

export async function sheetRows(userId: string, urlOrId: string): Promise<string[][]> {
  const id = /\/d\/([a-zA-Z0-9_-]+)/.exec(urlOrId)?.[1] ?? urlOrId;
  const d = (await g(userId, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/A1:Z2000`)) as { values?: string[][] };
  return d.values ?? [];
}
