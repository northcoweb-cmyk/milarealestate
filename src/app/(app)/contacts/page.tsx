"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { Contact } from "@/lib/types";
import { CONTACT_TYPES } from "@/lib/types";
import { Avatar, Empty, PageHeader, Pill, Skeleton } from "@/components/ui";
import { Page, STATUS_LABEL, TYPE_LABEL, ago } from "@/components/page";
import { useApi } from "@/components/use-api";
import { AddPeople } from "@/components/add-people";

export default function ContactsPage() {
  const { data, loading, reload } = useApi<{ contacts: Contact[] }>("/api/contacts");
  const [q, setQ] = useState(""); const [type, setType] = useState<string>("all"); const [adding, setAdding] = useState(false);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.contacts ?? []).filter((c) => (type === "all" || c.type === type) && (!s || [c.name, c.email, c.phone, c.location, ...c.tags].some((f) => f?.toLowerCase().includes(s))));
  }, [data, q, type]);
  const present = useMemo(() => new Set((data?.contacts ?? []).map((c) => c.type)), [data]);
  return (
    <Page>
      <PageHeader title="Contacts" sub={data ? `${data.contacts.length} people` : undefined} right={<button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={18} />Add people</button>} />
      <div className="relative mb-4"><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" /><input className="field !pl-11" placeholder="Search by name, email, area, tag…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search contacts" /></div>
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4">
        {["all", ...CONTACT_TYPES.filter((t) => present.has(t))].map((t) => <button key={t} className="chip shrink-0" style={type === t ? { background: "var(--accent)", color: "var(--accent-ink)" } : undefined} onClick={() => setType(t)}>{t === "all" ? "Everyone" : TYPE_LABEL[t]}</button>)}
      </div>
      {loading && !data ? <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div> : !list.length ? (
        <Empty title={data?.contacts.length ? "No matches" : "Add the people you work with"} body={data?.contacts.length ? "Try a different search." : "Import a list, upload a sign-in sheet, or just tell Mila: “I have a new buyer named…”."} action={!data?.contacts.length ? <button className="btn btn-primary" onClick={() => setAdding(true)}>Add people</button> : undefined} />
      ) : (
        <ul className="glass divide-y overflow-hidden" style={{ borderColor: "var(--line)" }}>
          {list.map((c) => (
            <li key={c.id}><Link href={`/contacts/${c.id}`} className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-white/30 sm:px-5">
              <Avatar name={c.name} color={c.avatar_color} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><p className="truncate font-semibold leading-tight">{c.name}</p></div>
                <p className="faint truncate text-[13.5px]">{c.location ?? c.next_action ?? "—"}</p>
              </div>
              <div className="hidden flex-col items-end gap-1 sm:flex"><Pill tone="accent">{TYPE_LABEL[c.type]}</Pill><span className="faint text-[12.5px]">{ago(c.last_contact_at)}</span></div>
              <div className="flex flex-col items-end gap-1 sm:hidden"><Pill tone="accent">{TYPE_LABEL[c.type]}</Pill><span className="faint text-[12px]">{STATUS_LABEL[c.status]}</span></div>
            </Link></li>
          ))}
        </ul>
      )}
      <AddPeople open={adding} onClose={() => setAdding(false)} onDone={reload} />
    </Page>
  );
}
