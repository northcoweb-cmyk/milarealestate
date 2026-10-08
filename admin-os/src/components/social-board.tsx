"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface Item { id: string; created_at: string; kind: "post" | "outreach" | "note"; day: string; platform: string | null; link: string | null; handle: string | null; note: string | null; by: string }
const PL: Record<string, string> = { tiktok: "TikTok", x: "X", instagram: "Instagram" };
const TARGET = 2; // posts per platform per day (1 to 2 is the goal; 2 is the cap on the bar)

async function send(method: "POST" | "DELETE", body?: object, id?: string) {
  const r = await fetch(`/api/items${id ? `?id=${id}` : ""}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? "Failed.");
}

export function SocialBoard({ items, today, who }: { items: Item[]; today: string; who: "ryan" | "sarah" }) {
  const router = useRouter();
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [post, setPost] = useState({ platform: "tiktok", link: "", note: "" });
  const [out, setOut] = useState({ platform: "x", handle: "", note: "" });
  const [note, setNote] = useState("");
  async function run(fn: () => Promise<void>, reset: () => void) { setBusy(true); setErr(""); try { await fn(); reset(); router.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); } finally { setBusy(false); } }
  const todays = (p: string) => items.filter((i) => i.kind === "post" && i.day === today && i.platform === p).length;
  const posts = items.filter((i) => i.kind === "post"), outreach = items.filter((i) => i.kind === "outreach"), notes = items.filter((i) => i.kind === "note");
  const del = (id: string) => run(() => send("DELETE", undefined, id), () => {});
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  return (
    <div className="grid" style={{ gap: 16 }}>
      {err && <p className="note warn" role="alert">{err}</p>}
      <div className="grid g4">
        {["tiktok", "x"].map((p) => { const n = todays(p); return <div key={p} className="card"><p className="eyebrow">{PL[p]} today</p><p className="num">{n}<span className="sub"> / {TARGET}</span></p><p className="sub">{n >= 1 ? (n >= TARGET ? "Done for today ✓" : "Goal met, one more if you can") : "No post yet"}</p></div>; })}
        <div className="card"><p className="eyebrow">Realtors talked to today</p><p className="num">{outreach.filter((o) => o.day === today).length}</p></div>
      </div>
      <div className="grid g2">
        <div className="card">
          <p className="eyebrow">Log a post</p>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <select className="field" value={post.platform} onChange={(e) => setPost({ ...post, platform: e.target.value })}><option value="tiktok">TikTok</option><option value="x">X</option><option value="instagram">Instagram</option></select>
            <input className="field" placeholder="Link to the post (https://…)" value={post.link} onChange={(e) => setPost({ ...post, link: e.target.value })} />
            <textarea className="field" rows={2} placeholder="What it was about (optional)" value={post.note} onChange={(e) => setPost({ ...post, note: e.target.value })} />
            <button className="btn primary" disabled={busy} onClick={() => run(() => send("POST", { kind: "post", ...post }), () => setPost({ ...post, link: "", note: "" }))}>Log post</button>
          </div>
        </div>
        <div className="card">
          <p className="eyebrow">Log a realtor you talked to</p>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <select className="field" value={out.platform} onChange={(e) => setOut({ ...out, platform: e.target.value })}><option value="x">X</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option></select>
            <input className="field" placeholder="Their handle or name" value={out.handle} onChange={(e) => setOut({ ...out, handle: e.target.value })} />
            <textarea className="field" rows={2} placeholder="What you talked about, what they said" value={out.note} onChange={(e) => setOut({ ...out, note: e.target.value })} />
            <button className="btn primary" disabled={busy} onClick={() => run(() => send("POST", { kind: "outreach", ...out }), () => setOut({ ...out, handle: "", note: "" }))}>Log conversation</button>
          </div>
        </div>
      </div>
      <div className="card">
        <p className="eyebrow">Notes (shared with {who === "sarah" ? "Ryan" : "Sarah"})</p>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <textarea className="field" style={{ flex: 1, minWidth: 220 }} rows={2} placeholder="Ideas, things to try, questions, what's working…" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn primary" disabled={busy} onClick={() => run(() => send("POST", { kind: "note", note }), () => setNote(""))}>Add note</button>
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 10 }}>
          {notes.map((n) => <li key={n.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}><p style={{ whiteSpace: "pre-wrap" }}>{n.note}</p><p className="sub">{n.by === "sarah" ? "Sarah" : "Ryan"} · {when(n.created_at)} · <button className="mute" style={{ background: "none", border: 0, cursor: "pointer", textDecoration: "underline", color: "inherit" }} onClick={() => del(n.id)}>delete</button></p></li>)}
          {!notes.length && <li className="mute">No notes yet.</li>}
        </ul>
      </div>
      <div className="grid g2">
        <div className="card"><p className="eyebrow">Recent posts</p><ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 8 }}>{posts.slice(0, 20).map((p) => <li key={p.id}><b>{PL[p.platform ?? ""] ?? p.platform}</b> {p.link ? <a href={p.link} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>link</a> : null} <span className="sub">· {when(p.created_at)} · {p.by}</span>{p.note && <p className="sub">{p.note}</p>}</li>)}{!posts.length && <li className="mute">Nothing logged yet.</li>}</ul></div>
        <div className="card"><p className="eyebrow">Recent conversations with realtors</p><ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 8 }}>{outreach.slice(0, 20).map((o) => <li key={o.id}><b>{o.handle}</b> <span className="sub">on {PL[o.platform ?? ""] ?? o.platform} · {when(o.created_at)} · {o.by}</span>{o.note && <p className="sub">{o.note}</p>}</li>)}{!outreach.length && <li className="mute">Nothing logged yet.</li>}</ul></div>
      </div>
    </div>
  );
}
