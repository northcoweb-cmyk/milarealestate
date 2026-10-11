import { makeSession, store } from "./lib.mts";
const { encrypt } = await import("../../src/lib/integrations/crypto");
const s = await makeSession({});
await store.insert("integrations", s.id, { provider: "google", status: "connected", account_label: "a@b.c", scopes: ["https://www.googleapis.com/auth/calendar.events"], token_encrypted: encrypt(JSON.stringify({ access_token: "t", expires_at: Date.now() + 3600e3 })), error: null, connected_at: new Date().toISOString() });
const real = globalThis.fetch; let calls = 0;
globalThis.fetch = (async (u: any, i: any) => { if (String(u).includes("googleapis.com")) { calls++; throw new DOMException("The operation timed out.", "TimeoutError"); } return real(u, i); }) as any;
for (const m of ["showing at 12 Oak Lane Arlington VA Saturday at 2pm", "showing at 12 Oak Lane Arlington VA Saturday at 2pm", "move the showing to 4pm"]) {
  const r = await s.say(m); console.log("> " + m + "\n< " + r.milaMessage.content + "\n  " + JSON.stringify(r.milaMessage.blocks).slice(0, 500));
}
console.log("calls", calls, JSON.stringify((await store.list("calendar_events", s.id)).map((e: any) => [e.title, e.status, e.external_id, e.synced_at])));
