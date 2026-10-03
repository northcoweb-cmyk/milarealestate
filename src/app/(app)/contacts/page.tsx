"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRightLeft, Plus, Search } from "lucide-react";
import type { Contact } from "@/lib/types";
import { CONTACT_TYPES } from "@/lib/types";
import { Avatar, TypeBadge, Empty, PageHeader, Sheet, Skeleton, jfetch } from "@/components/ui";
import { Page, TYPE_LABEL, ago } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";
import { AddPeople } from "@/components/add-people";
import { STAGES, stageOf } from "@/lib/pipeline";
import { contactEmoji } from "@/lib/emoji";

export default function ContactsPage() {
  const { data, loading, reload, setData } = useApi<{ contacts: Contact[] }>("/api/contacts");
  const { toast } = useApp();
  const [q, setQ] = useState(""); const [type, setType] = useState("all"); const [stage, setStage] = useState("all"); const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<Contact | null>(null);
  const all = data?.contacts ?? [];
  const searched = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((c) => (type === "all" || c.type === type) && (!s || [c.name, c.email, c.phone, c.location, ...c.tags].some((f) => f?.toLowerCase().includes(s))));
  }, [all, q, type]);
  const counts = useMemo(() => Object.fromEntries(STAGES.map((s) => [s.key, searched.filter((c) => stageOf(c.status).key === s.key).length])), [searched]);
  const list = useMemo(() => (stage === "all" ? searched : searched.filter((c) => stageOf(c.status).key === stage)), [searched, stage]);
  const present = useMemo(() => new Set(all.map((c) => c.type)), [all]);

  async function moveTo(c: Contact, key: string) {
    const st = STAGES.find((s) => s.key === key)!;
    setMoving(null);
    setData((d) => (d ? { ...d, contacts: d.contacts.map((x) => (x.id === c.id ? { ...x, status: st.set } : x)) } : d)); // instant, then confirm with the server
    try { await jfetch(`/api/contacts/${c.id}`, { method: "PATCH", json: { status: st.set } }); toast(`${c.name.split(" ")[0]} moved to ${st.label}.`, "success"); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't move them.", "error"); reload(); }
  }

  const Row = ({ c }: { c: Contact }) => {
    const st = stageOf(c.status);
    return (
      <li className="flex items-center gap-3 border-t px-4 py-3 first:border-t-0 sm:px-5 lg:odd:border-r lg:[&:nth-child(2)]:border-t-0">
        <Link href={`/contacts/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3.5">
          <Avatar name={c.name} seed={c.id} size={44} ring="var(--ink-faint)" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold leading-tight">{c.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"><TypeBadge type={c.type} label={TYPE_LABEL[c.type]} emoji={contactEmoji(c.type)} /><span className="faint text-[12.5px]">{st.emoji} {st.label}</span></div>
          </div>
        </Link>
        <button onClick={() => setMoving(c)} className="btn btn-quiet shrink-0 !min-h-[44px] !min-w-[44px] !px-2.5" aria-label={`${c.name}: ${st.label}. Change stage`}><ArrowRightLeft size={18} /></button>
      </li>
    );
  };

  return (
    <Page wide>
      <PageHeader title="Contacts" sub={data ? `${all.length} people` : undefined} right={<button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={18} />Add</button>} />
      <div className="relative mb-4"><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" /><input className="field !pl-11" placeholder="Search name, email, area, tag…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search contacts" /></div>

      <p className="kicker mb-2">Pipeline</p>
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 pb-1" role="tablist" aria-label="Pipeline stage">
        <button role="tab" aria-selected={stage === "all"} className={"chip shrink-0 " + (stage === "all" ? "is-selected" : "")} onClick={() => setStage("all")}>Everyone <span className="opacity-60">{searched.length}</span></button>
        {STAGES.map((s) => <button key={s.key} role="tab" aria-selected={stage === s.key} className={"chip shrink-0 " + (stage === s.key ? "is-selected" : "")} onClick={() => setStage(s.key)}><span aria-hidden>{s.emoji}</span>{s.label} <span className="opacity-60">{counts[s.key]}</span></button>)}
      </div>
      {stage !== "all" && <p className="muted mb-3 px-1 text-[14px]">{STAGES.find((s) => s.key === stage)?.blurb}</p>}

      {present.size > 1 && <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        {["all", ...CONTACT_TYPES.filter((t) => present.has(t))].map((t) => <button key={t} className={"chip shrink-0 " + (type === t ? "is-selected" : "")} onClick={() => setType(t)}>{t === "all" ? "All types" : <>{contactEmoji(t)} {TYPE_LABEL[t]}</>}</button>)}
      </div>}

      {loading && !data ? <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div> : !list.length ? (
        <Empty title={all.length ? "Nobody here" : "Add the people you work with"} body={all.length ? "Try another stage or search." : "Import a list, upload a sign-in sheet, or just tell Mila: “I have a new buyer named…”."} action={!all.length ? <button className="btn btn-primary" onClick={() => setAdding(true)}>Add people</button> : undefined} />
      ) : stage === "all" ? (
        <div className="space-y-6">
          {STAGES.filter((s) => counts[s.key] > 0).map((s) => (
            <section key={s.key} aria-label={s.label}>
              <div className="mb-2 flex items-baseline justify-between px-1"><h2 className="text-[15px] font-semibold"><span aria-hidden>{s.emoji}</span> {s.label}</h2><span className="faint text-[13px]">{counts[s.key]}</span></div>
              <ul className="glass overflow-hidden lg:grid lg:grid-cols-2" style={{ borderColor: "var(--line)", borderRadius: 24 }}>{searched.filter((c) => stageOf(c.status).key === s.key).map((c) => <Row key={c.id} c={c} />)}</ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="glass overflow-hidden lg:grid lg:grid-cols-2" style={{ borderColor: "var(--line)", borderRadius: 24 }}>{list.map((c) => <Row key={c.id} c={c} />)}</ul>
      )}

      <Sheet open={!!moving} onClose={() => setMoving(null)} title={moving ? `Move ${moving.name.split(" ")[0]}` : ""}>
        <ul className="space-y-1.5">
          {STAGES.map((s) => { const cur = moving && stageOf(moving.status).key === s.key; return (
            <li key={s.key}><button disabled={!!cur} onClick={() => moving && moveTo(moving, s.key)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition" style={{ background: cur ? "color-mix(in srgb, var(--ink) 8%, transparent)" : "transparent" }}>
              <span className="text-[22px]" aria-hidden>{s.emoji}</span><span className="min-w-0 flex-1"><span className="block font-semibold">{s.label}</span><span className="faint block text-[13px]">{s.blurb}</span></span>{cur && <span className="faint text-[12.5px]">Current</span>}
            </button></li>); })}
        </ul>
      </Sheet>
      <AddPeople open={adding} onClose={() => setAdding(false)} onDone={reload} />
    </Page>
  );
}
