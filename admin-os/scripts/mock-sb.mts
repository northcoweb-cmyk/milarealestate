import http from "node:http";
// A tiny stand-in for Supabase's REST API: enough to run the creator program end to end.
const db: Record<string, any[]> = { creators: [], creator_videos: [], profiles: [], subscriptions: [], credit_transactions: [], waitlist: [], messages: [], partner_payouts: [] };
const get = (row: any, k: string) => k.split(/->>|->/).reduce((o: any, part) => (o == null ? undefined : o[part]), row);
const match = (row: any, q: URLSearchParams) => { for (const [k, v] of q) { if (["select", "order", "limit"].includes(k)) continue; const m = /^(eq|is|neq|gte|ilike|in)\.(.*)$/.exec(v); if (!m) continue; const val = decodeURIComponent(m[2]), cur = get(row, k); if (m[1] === "eq" && String(cur) !== val) return false; if (m[1] === "neq" && String(cur) === val) return false; if (m[1] === "gte" && !(String(cur) >= val)) return false; if (m[1] === "ilike" && String(cur).toLowerCase() !== val.toLowerCase()) return false; if (m[1] === "in" && !val.replace(/^\(|\)$/g, "").split(",").includes(String(cur))) return false; if (m[1] === "is" && val === "null" && cur != null) return false; } return true; };
export function start(port: number) {
  const s = http.createServer(async (req, res) => {
    const u = new URL(req.url!, "http://x"); const name = u.pathname.replace("/rest/v1/", "");
    const t = db[name]; if (!t) { res.statusCode = 404; return res.end("{}"); }
    let body = ""; for await (const c of req) body += c;
    res.setHeader("content-type", "application/json");
    if (req.method === "GET") { const rows = t.filter((r) => match(r, u.searchParams)); return res.end(JSON.stringify(rows)); }
    if (req.method === "POST") { const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...JSON.parse(body) }; if (name === "creators") { Object.assign(row, { status: "invited", reminders_sent: 0, sent: {}, tier: "creator", commission_pct: 20, commission_months: 12, videos_per_month: 2, ...JSON.parse(body) }); if (t.some((x) => x.email === row.email)) { res.statusCode = 409; return res.end("{}"); } } if (name === "creator_videos") Object.assign(row, { status: "submitted", checks: {}, kind: "trial", flags: [], ...JSON.parse(body) }); t.push(row); return res.end(JSON.stringify([row])); }
    if (req.method === "PATCH") { const rows = t.filter((r) => match(r, u.searchParams)); for (const r of rows) Object.assign(r, JSON.parse(body)); return res.end(JSON.stringify(rows)); }
    if (req.method === "DELETE") { for (const r of t.filter((r) => match(r, u.searchParams))) t.splice(t.indexOf(r), 1); return res.end("[]"); }
    res.end("[]");
  });
  s.listen(port); return { db, close: () => s.close() };
}
