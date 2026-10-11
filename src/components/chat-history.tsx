"use client";

import { useEffect, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { Confirm, Sheet, jfetch } from "./ui";

interface Row { id: string; title: string; snippet: string; updated_at: string; count: number; open: boolean }

/** Your past chats: search them, reopen one and carry on, or delete a chat (only the chat: your contacts, properties and calendar are separate and stay). */
export function ChatHistory({ open, onClose, currentId, onPick }: { open: boolean; onClose: () => void; currentId: string | null; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [del, setDel] = useState<Row | null>(null);
  const load = (term: string) => jfetch<{ conversations: Row[] }>(`/api/conversations${term ? `?q=${encodeURIComponent(term)}` : ""}`).then((r) => setRows(r.conversations)).catch(() => setRows([]));
  useEffect(() => { if (!open) return; setRows(null); const t = setTimeout(() => void load(q.trim()), q ? 250 : 0); return () => clearTimeout(t); }, [open, q]);
  const when = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
  return (
    <>
      <Sheet open={open} onClose={onClose} title="Your chats">
        <div className="relative mb-3"><Search size={16} className="faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden /><input className="field !pl-9" placeholder="Search your chats" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search chats" /></div>
        {rows === null ? <p className="muted text-[14.5px]">Loading…</p> : !rows.length ? <p className="muted text-[14.5px]">{q ? "No chat matches that." : "No past chats yet."}</p> : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="glass flex items-center gap-2 p-3" style={{ borderRadius: 18, outline: r.id === currentId ? "2px solid var(--accent)" : "none" }}>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { onPick(r.id); onClose(); }}>
                  <p className="truncate font-semibold">{r.title}{r.open ? <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>Open question</span> : null}</p>
                  <p className="faint truncate text-[13px]">{when(r.updated_at)} · {r.snippet}</p>
                </button>
                <button type="button" className="btn btn-quiet btn-sm !px-2" aria-label={`Delete chat ${r.title}`} onClick={() => setDel(r)}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      <Confirm open={!!del} onClose={() => setDel(null)} danger title="Delete this chat?" body="This deletes only the conversation. Your contacts, properties, calendar, drafts and approvals are not deleted." confirmLabel="Delete chat"
        onConfirm={async () => { const d = del; setDel(null); if (!d) return; try { await jfetch(`/api/conversations/${d.id}?confirm=1`, { method: "DELETE" }); setRows((x) => (x ?? []).filter((r) => r.id !== d.id)); if (d.id === currentId) onPick(""); } catch { /* quiet */ } }} />
    </>
  );
}
