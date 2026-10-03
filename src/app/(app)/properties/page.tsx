"use client";

import Link from "next/link";
import { useApp } from "@/components/app-context";
import { useMemo, useState } from "react";
import { Building2, Plus, Search } from "lucide-react";
import type { PropertyCardInfo, Group } from "@/lib/property-stage";
import { Empty, PageHeader, Skeleton } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { PropertyCard } from "@/components/property-card";
import { useListingPhotos } from "@/components/use-listing-photos";
import { useMila } from "@/components/mila-chat";

type Tab = "current" | "upcoming" | "past" | "all";
const TABS: [Tab, string][] = [["current", "Current"], ["upcoming", "Upcoming"], ["past", "Past"], ["all", "All"]];
const GROUP_TITLE: Record<Group, string> = { current: "Current", upcoming: "Upcoming", past: "Past" };

const REASON: Record<string, string> = {
  no_key: "no photo-provider key is set on this deployment (or it was added without redeploying)",
  needs_city_state: "the home has no city/state",
  limited: "this plan's monthly photo allowance is used up",
  budget: "the shared monthly photo budget is used up",
  provider_auth: "the provider rejected the key",
  provider_credits: "the provider is out of credits",
  provider_rate: "the provider is rate-limiting",
  provider_network: "couldn't reach the provider",
  provider_bad_response: "the provider's answer wasn't readable",
  mismatch: "the provider found a different home at that address, so I refused to use its photos",
  not_found: "the provider doesn't know this address",
  empty: "the provider has no photos for this home",
  error: "a server error (see Errors & gaps)",
};

export default function PropertiesPage() {
  const { data, loading, reload } = useApi<{ properties: PropertyCardInfo[] }>("/api/properties?view=cards");
  const mila = useMila();
  const { admin } = useApp();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Tab | null>(null);
  const all = data?.properties ?? [];
  // listing photos only for homes that are live or coming up, and not when the agent already uploaded one (the server caps how many it enriches at once)
  const photoOf = useListingPhotos(useMemo(() => all.filter((p) => p.image_source !== "photo" && p.group !== "past" && p.city && p.state).slice(0, 8).map((p) => ({ key: p.id, address: p.address, city: p.city, state: p.state, zip: p.zip, propertyId: p.id })), [all]), { enrich: true });
  const counts = useMemo(() => ({ current: all.filter((p) => p.group === "current").length, upcoming: all.filter((p) => p.group === "upcoming").length, past: all.filter((p) => p.group === "past").length, all: all.length }), [all]);
  // open on whatever the agent is most likely here for: what's live now, else what's coming, else everything
  const tab: Tab = picked ?? (counts.current ? "current" : counts.upcoming ? "upcoming" : "all");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((p) => (tab === "all" || p.group === tab) && (!t || `${p.address} ${p.city ?? ""} ${p.state ?? ""} ${p.zip ?? ""}`.toLowerCase().includes(t)));
  }, [all, tab, q]);

  return (
    <Page wide>
      <PageHeader title="Properties" sub="Everything you're working on, coming up, and have closed." right={<button className="btn btn-primary" onClick={() => mila.open()}><Plus size={18} />Add</button>} />
      {admin && photoOf.reasons().length > 0 && <p className="mb-4 rounded-2xl p-3 text-[13.5px] leading-snug" style={{ background: "color-mix(in srgb, var(--warn) 14%, transparent)" }}><b>Owner note - listing photos aren&apos;t loading:</b> {photoOf.reasons().map((r) => REASON[r] ?? r).join(" · ")} <Link href="/admin" className="font-semibold underline">Open the Health tab</Link> and run “Listing photos check”. (Agents don&apos;t see this.)</p>}
      {loading && !data ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72" />)}</div> : !all.length ? (
        <Empty title="No properties yet" body="Tell Mila about a listing — “New listing at 12 Oak St, $650k, 3 bed 2 bath” — or ask her to prep any address, and it shows up here with its photo and numbers." action={<button className="btn btn-primary" onClick={() => mila.open()}>Tell Mila</button>} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0" role="tablist" aria-label="Show">
              {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={"chip shrink-0 " + (tab === k ? "is-selected" : "")} onClick={() => setPicked(k)}>{l} · {counts[k]}</button>)}
            </div>
            <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs"><Search size={16} className="faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden /><input className="field !pl-9" placeholder="Search address or city" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search properties" /></div>
          </div>
          {!shown.length ? <Empty title={q ? "Nothing matches" : `No ${tab === "all" ? "" : TABS.find(([k]) => k === tab)![1].toLowerCase() + " "}properties`} body={q ? "Try another address or city." : tab === "past" ? "Closed deals land here after you tell Mila “I closed on…”." : tab === "upcoming" ? "New listings you're prepping show up here before they go live." : "Put a listing on the calendar and it moves here."} /> : tab === "all" ? (
            (["current", "upcoming", "past"] as Group[]).map((g) => { const list = shown.filter((p) => p.group === g); return list.length ? (
              <section key={g} className="mb-8" aria-label={GROUP_TITLE[g]}>
                <h2 className="kicker mb-3 flex items-center gap-2"><Building2 size={14} aria-hidden />{GROUP_TITLE[g]} · {list.length}</h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{list.map((p) => <PropertyCard key={p.id} p={p} photo={photoOf(p.id)} onChanged={reload} />)}</div>
              </section>) : null; })
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{shown.map((p) => <PropertyCard key={p.id} p={p} photo={photoOf(p.id)} onChanged={reload} />)}</div>
          )}
        </>
      )}
    </Page>
  );
}
