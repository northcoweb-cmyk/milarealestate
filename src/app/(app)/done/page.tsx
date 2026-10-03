"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { Empty, PageHeader, Skeleton } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import type { TimelineDay } from "@/lib/feed";

interface Data { days: TimelineDay[]; total: number; byYou: number; byMila: number }
const FILTERS = [{ v: "all", l: "All" }, { v: "you", l: "You" }, { v: "mila", l: "Mila" }] as const;

export default function DonePage() {
  const [range, setRange] = useState(14);
  const { data, loading } = useApi<Data>(`/api/feed/timeline?days=${range}`);
  const [who, setWho] = useState<"all" | "you" | "mila">("all");
  const time = (iso: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const days = (data?.days ?? []).map((d) => ({ ...d, items: d.items.filter((i) => who === "all" || i.by === who) })).filter((d) => d.items.length);
  return (
    <Page>
      <PageHeader title="Completed" sub="Everything finished, in the order it happened." />
      {data && data.total > 0 && (
        <div className="glass mb-5 grid grid-cols-3 divide-x p-4 text-center" style={{ borderRadius: 24, borderColor: "var(--line)" }}>
          <div><p className="display text-[30px] leading-none">{data.total}</p><p className="faint mt-1 text-[12.5px]">done</p></div>
          <div><p className="display text-[30px] leading-none">{data.byYou}</p><p className="faint mt-1 text-[12.5px]">by you</p></div>
          <div><p className="display text-[30px] leading-none">{data.byMila}</p><p className="faint mt-1 text-[12.5px]">by Mila</p></div>
        </div>
      )}
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        {FILTERS.map((f) => <button key={f.v} onClick={() => setWho(f.v)} className={"chip shrink-0 " + (who === f.v ? "is-selected" : "")}>{f.l}</button>)}
        <span className="mx-1 w-px shrink-0 self-stretch" style={{ background: "var(--line)" }} />
        {[7, 14, 30].map((n) => <button key={n} onClick={() => setRange(n)} className={"chip shrink-0 " + (range === n ? "is-selected" : "")}>{n} days</button>)}
      </div>
      {loading && !data ? <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        : !days.length ? <Empty title="Nothing completed yet" body="Check things off in Today's plan, or approve what Mila prepares — it all lands here." action={<Link href="/" className="btn btn-primary">Back to Home</Link>} />
        : (
          <div className="space-y-8">
            {days.map((d) => (
              <section key={d.key} aria-label={d.label}>
                <div className="mb-3 flex items-baseline justify-between px-1"><h2 className="text-[17px] font-semibold">{d.label}</h2><span className="faint text-[13px]">{d.items.length} done</span></div>
                <ol className="relative ml-[21px] space-y-4 border-l-2 pl-6" style={{ borderColor: "color-mix(in srgb, var(--ok) 45%, transparent)" }}>
                  {d.items.map((i, n) => {
                    const body = (<>
                      <p className="text-[15.5px] font-semibold leading-snug">{i.text}</p>
                      {i.sub && <p className="muted text-[13.5px] leading-snug">{i.sub}</p>}
                      <p className="faint mt-0.5 text-[12.5px]">{time(i.at)} · {i.by === "you" ? "You" : "Mila"}</p>
                    </>);
                    return (
                      <motion.li key={i.id} className="relative" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(n, 8) * 0.03, duration: 0.25 }}>
                        <span className="absolute -left-[46px] top-0 flex h-[34px] w-[34px] items-center justify-center rounded-full text-[17px]" style={{ background: "var(--glass-strong)", boxShadow: "0 0 0 2px color-mix(in srgb, var(--ok) 60%, transparent)" }} aria-hidden>{i.emoji}</span>
                        {i.href ? <Link href={i.href} className="block">{body}</Link> : body}
                      </motion.li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
    </Page>
  );
}
