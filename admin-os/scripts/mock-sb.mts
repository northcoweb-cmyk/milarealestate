import http from "node:http";
// A tiny stand-in for Supabase's REST API: enough to run the creator program end to end.
const db: Record<string, any[]> = { creators: [], creator_videos: [], profiles: [], subscriptions: [], credit_transactions: [], waitlist: [] };
const match = (row: any, q: URLSearchParams) => { for (const [k, v] of q) { if (["select", "order", "limit"].includes(k)) continue; const m = /^(eq|is|neq)\.(.*)$/.exec(v); if (!m) continue; const val = m[2]; if (m[1] === "eq" && String(row[k]) !== decodeURIComponent(val)) return false; if (m[1] === "is" && val === "null" && row[k] != null) return false; } return true; };
export function start(port: number) {
  const s = http.createServer(async (req, res) => {
    const u = new URL(req.url!, "http://x"); const name = u.pathname.replace("/rest/v1/", "");
    const t = db[name]; if (!t) { res.statusCode = 404; return res.end("{}"); }
    let body = ""; for await (const c of req) body += c;
    res.setHeader("content-type", "application/json");
    if (req.method === "GET") { const rows = t.filter((r) => match(r, u.searchParams)); return res.end(JSON.stringify(rows)); }
    if (req.method === "POST") { const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...JSON.parse(body) }; if (name === "creators") { Object.assign(row, { status: "invited", reminders_sent: 0, ...JSON.parse(body) }); if (t.some((x) => x.email === row.email)) { res.statusCode = 409; return res.end("{}"); } } if (name === "creator_videos") Object.assign(row, { status: "submitted", checks: {}, ...JSON.parse(body) }); t.push(row); return res.end(JSON.stringify([row])); }
    if (req.method === "PATCH") { const rows = t.filter((r) => match(r, u.searchParams)); for (const r of rows) Object.assign(r, JSON.parse(body)); return res.end(JSON.stringify(rows)); }
    if (req.method === "DELETE") { for (const r of t.filter((r) => match(r, u.searchParams))) t.splice(t.indexOf(r), 1); return res.end("[]"); }
    res.end("[]");
  });
  s.listen(port); return { db, close: () => s.close() };
}
