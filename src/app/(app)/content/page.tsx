"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, Plus, Copy, Share2, Trash2 } from "lucide-react";
import type { SocialPlatform, SocialPost } from "@/lib/types";
import { Confirm, Empty, PageHeader, Pill, Sheet, Skeleton, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";
import { MiniSlide, PLATFORM_META, PlatformBadge, STATUS_META, toLocalInput } from "@/components/content/shared";
import { renderAll, shareOrDownload } from "@/lib/content/render";

type Tab = "drafts" | "ready" | "scheduled" | "posted";
interface Data {
  posts: SocialPost[]; counts: Record<Tab | "archived", number>;
  properties: { id: string; address: string; verified: boolean }[];
  categories: { key: string; label: string; blurb: string; needsProperty: boolean; group: string }[];
  platforms: { key: SocialPlatform; label: string; limit: number }[]; tz: string; ai: boolean;
}
const TABS: { key: Tab; label: string }[] = [{ key: "drafts", label: "Drafts" }, { key: "ready", label: "Ready" }, { key: "scheduled", label: "Scheduled" }, { key: "posted", label: "Posted" }];

function ContentInner() {
  const params = useSearchParams();
  const initial = (params.get("tab") as Tab) || "drafts";
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === initial) ? initial : "drafts");
  const [platform, setPlatform] = useState<SocialPlatform | "">("");
  const { data, loading, reload } = useApi<Data>(`/api/content?status=${tab}${platform ? `&platform=${platform}` : ""}`);
  const [open, setOpen] = useState<SocialPost | null>(null);
  const [creating, setCreating] = useState(false);
  const [planning, setPlanning] = useState(params.get("plan") === "1");
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const posts = data?.posts ?? [];
  useEffect(() => { setOpen((o) => (o ? posts.find((p) => p.id === o.id) ?? null : o)); }, [posts]);

  async function approveAll() {
    setBusy(true);
    try { const r = await jfetch<{ scheduled?: number }>("/api/content/bulk", { method: "POST", json: { action: "approve_schedule", ids: posts.map((p) => p.id) } }); toast(`Scheduled ${r.scheduled ?? posts.length} posts.`, "success"); reload(); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't schedule those.", "error"); } finally { setBusy(false); }
  }

  return (
    <Page>
      <PageHeader title="Content" sub="Mila writes the posts. You approve and post." right={<div className="flex gap-2"><button className="btn btn-quiet btn-sm" onClick={() => setPlanning(true)}><Sparkles size={16} /> Plan</button><button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Plus size={16} /> New</button></div>} />
      <p className="faint mb-4 text-[13px]">Auto-posting to Instagram, Facebook, TikTok and LinkedIn is coming soon. For now, share to your phone in one tap.</p>

      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {TABS.map((t) => <button key={t.key} onClick={() => setTab(t.key)} className={"chip " + (tab === t.key ? "is-selected" : "")}>{t.label}{data ? ` · ${data.counts[t.key]}` : ""}</button>)}
      </div>
      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto">
        <button onClick={() => setPlatform("")} className={"chip " + (!platform ? "is-selected" : "")}>All</button>
        {(data?.platforms ?? []).map((p) => <button key={p.key} onClick={() => setPlatform(p.key)} className={"chip " + (platform === p.key ? "is-selected" : "")}>{p.label}</button>)}
      </div>

      {tab === "drafts" && posts.length > 1 && <div className="glass mb-4 flex items-center justify-between gap-3 p-4" style={{ borderRadius: 22 }}><p className="text-[14.5px]">{posts.length} drafts waiting.</p><button className="btn btn-primary btn-sm" disabled={busy} onClick={approveAll}>{busy ? "Working…" : "Approve & schedule all"}</button></div>}

      {loading && !data ? <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        : posts.length === 0 ? <Empty title={tab === "drafts" ? "No drafts" : `Nothing ${tab} yet`} body="Tap New for a single post, or Plan to have Mila fill your week." />
        : <ul className="space-y-3">{posts.map((p) => (
          <li key={p.id}><button onClick={() => setOpen(p)} className="glass flex w-full gap-3 p-3 text-left" style={{ borderRadius: 22 }}>
            <MiniSlide post={p} />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2"><PlatformBadge platform={p.platform} size={22} /><Pill tone={STATUS_META[p.status]?.tone}>{STATUS_META[p.status]?.label}</Pill>{p.stale && <Pill tone="warn">Outdated</Pill>}</div>
              <p className="line-clamp-3 text-[14.5px] leading-snug">{p.caption}</p>
              {p.scheduled_for && <p className="faint mt-1 text-[12.5px]">{new Intl.DateTimeFormat("en-US", { timeZone: data?.tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(p.scheduled_for))}</p>}
            </div>
          </button></li>))}</ul>}

      {open && data && <Editor post={open} data={data} onClose={() => setOpen(null)} onChanged={reload} />}
      {creating && data && <NewPost data={data} onClose={() => setCreating(false)} onDone={() => { setCreating(false); setTab("drafts"); reload(); }} />}
      {planning && data && <PlanSheet data={data} onClose={() => setPlanning(false)} onDone={() => { setPlanning(false); setTab("drafts"); reload(); }} />}
    </Page>
  );
}

function Editor({ post, data, onClose, onChanged }: { post: SocialPost; data: Data; onClose: () => void; onChanged: () => void }) {
  const { toast } = useApp();
  const [caption, setCaption] = useState(post.caption);
  const [when, setWhen] = useState(toLocalInput(post.scheduled_for, data.tz));
  const [busy, setBusy] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const limit = data.platforms.find((p) => p.key === post.platform)?.limit ?? 2200;
  const over = caption.length > limit;
  async function act(action: string, extra: Record<string, unknown> = {}, msg?: string) {
    setBusy(action);
    try {
      const body: Record<string, unknown> = { action, ...extra };
      if (caption !== post.caption) body.caption = caption;
      await jfetch(`/api/content/${post.id}`, { method: "PATCH", json: body });
      if (msg) toast(msg, "success");
      onChanged(); if (action !== "regenerate") onClose();
    } catch (e) { toast(e instanceof Error ? e.message : "That didn't work.", "error"); } finally { setBusy(null); }
  }
  async function share() {
    setBusy("share");
    try { const files = await renderAll(post.slides, PLATFORM_META[post.platform].label); const r = await shareOrDownload(files, caption); if (r === "downloaded") toast("Images saved. Caption copied.", "success"); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't make the images.", "error"); } finally { setBusy(null); }
  }
  const st = post.status;
  return (
    <Sheet open onClose={onClose} title={PLATFORM_META[post.platform].label + " post"} wide>
      <div className="space-y-4">
        <div className="flex gap-3 overflow-x-auto">{post.slides.map((s, i) => <MiniSlide key={i} post={{ ...post, slides: [s] }} />)}</div>
        <div>
          <textarea className="field w-full" rows={7} value={caption} onChange={(e) => setCaption(e.target.value)} aria-label="Caption" />
          <p className={"mt-1 text-right text-[12.5px] " + (over ? "text-[color:var(--danger)]" : "faint")}>{caption.length.toLocaleString()} / {limit.toLocaleString()}</p>
          {post.hashtags.length > 0 && <p className="faint text-[13px]">{post.hashtags.join(" ")}</p>}
        </div>
        {st !== "published" && st !== "archived" && (
          <div><label className="kicker mb-1 block">Schedule for</label><div className="flex gap-2"><input type="datetime-local" className="field flex-1" value={when} onChange={(e) => setWhen(e.target.value)} /><button className="btn btn-primary btn-sm" disabled={!when || !!busy || over} onClick={() => act("schedule", { scheduled_for: when }, "Scheduled. Mila will remind you.")}>{busy === "schedule" ? "…" : "Schedule"}</button></div></div>
        )}
        <div className="flex flex-wrap gap-2">
          {(st === "draft" || st === "pending_approval") && <button className="btn btn-primary btn-sm" disabled={!!busy || over} onClick={() => act("ready", {}, "Ready to post.")}>Approve</button>}
          {st !== "published" && st !== "archived" && <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => act("posted", {}, "Marked as posted.")}>Mark posted</button>}
          {(st === "scheduled" || st === "approved_unpublished") && <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => act("draft")}>Back to draft</button>}
          {st === "archived" ? <button className="btn btn-quiet btn-sm" onClick={() => act("unarchive")}>Restore</button> : <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => act("archive")}>Archive</button>}
          {st !== "published" && <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => act("regenerate", {}, "Fresh version ready.")}>{busy === "regenerate" ? "Writing…" : "Rewrite"}</button>}
          <button className="btn btn-quiet btn-sm" onClick={() => { navigator.clipboard?.writeText(caption); toast("Caption copied.", "success"); }}><Copy size={15} /> Copy</button>
          <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={share}><Share2 size={15} /> {busy === "share" ? "…" : "Share"}</button>
          <button className="btn btn-quiet btn-sm" onClick={() => setDel(true)}><Trash2 size={15} /> Delete</button>
        </div>
        <div><p className="kicker mb-2">Copy to another platform</p><div className="flex flex-wrap gap-2">{data.platforms.filter((p) => p.key !== post.platform).map((p) => <button key={p.key} className="chip" disabled={!!busy} onClick={() => act("duplicate", { platforms: [p.key] }, `Copied to ${p.label} as a draft.`)}>{p.label}</button>)}</div></div>
      </div>
      <Confirm open={del} danger title="Delete this post?" body="This can't be undone." confirmLabel="Delete" onClose={() => setDel(false)} onConfirm={async () => { try { await jfetch(`/api/content/${post.id}?confirm=1`, { method: "DELETE" }); toast("Deleted.", "success"); onChanged(); onClose(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't delete.", "error"); } }} />
    </Sheet>
  );
}

function PlatformPicker({ data, value, onChange }: { data: Data; value: SocialPlatform[]; onChange: (v: SocialPlatform[]) => void }) {
  return <div className="flex flex-wrap gap-2">{data.platforms.map((p) => <button key={p.key} onClick={() => onChange(value.includes(p.key) ? value.filter((x) => x !== p.key) : [...value, p.key])} className={"chip " + (value.includes(p.key) ? "is-selected" : "")}>{p.label}</button>)}</div>;
}

function NewPost({ data, onClose, onDone }: { data: Data; onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const [cat, setCat] = useState<string>("buyer_tip");
  const [prop, setProp] = useState("");
  const [plats, setPlats] = useState<SocialPlatform[]>(["instagram"]);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const def = data.categories.find((c) => c.key === cat);
  async function go() {
    setBusy(true);
    try { const r = await jfetch<{ posts: unknown[] }>("/api/content", { method: "POST", json: { category: cat, platforms: plats, property_id: prop || null, topic: topic || null } }); toast(`${r.posts.length} draft${r.posts.length === 1 ? "" : "s"} ready.`, "success"); onDone(); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't create that.", "error"); } finally { setBusy(false); }
  }
  return (
    <Sheet open onClose={onClose} title="New post" wide>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2">{data.categories.map((c) => <button key={c.key} onClick={() => setCat(c.key)} className={"glass p-3 text-left " + (cat === c.key ? "is-selected" : "")} style={{ borderRadius: 18 }}><p className="text-[14.5px] font-semibold">{c.label}</p><p className="faint text-[12.5px]">{c.blurb}</p></button>)}</div>
        {def?.needsProperty && <div><label className="kicker mb-1 block">Property</label><select className="field w-full" value={prop} onChange={(e) => setProp(e.target.value)}><option value="">Choose a property…</option>{data.properties.map((p) => <option key={p.id} value={p.id}>{p.address}{p.verified ? "" : " (unverified)"}</option>)}</select></div>}
        <div><label className="kicker mb-1 block">Where</label><PlatformPicker data={data} value={plats} onChange={setPlats} /></div>
        <div><label className="kicker mb-1 block">Note for Mila (optional)</label><input className="field w-full" maxLength={400} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. mention first-time buyers" /></div>
        <button className="btn btn-primary w-full" disabled={busy || !plats.length || (!!def?.needsProperty && !prop)} onClick={go}>{busy ? "Writing…" : "Create draft"}</button>
      </div>
    </Sheet>
  );
}

function PlanSheet({ data, onClose, onDone }: { data: Data; onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const [per, setPer] = useState(3);
  const [plats, setPlats] = useState<SocialPlatform[]>(["instagram"]);
  const [cats, setCats] = useState<string[]>([]);
  const [approve, setApprove] = useState(false);
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => data.categories.filter((c) => !c.needsProperty), [data]);
  async function go() {
    setBusy(true);
    try { const r = await jfetch<{ created: number }>("/api/content/plan", { method: "POST", json: { postsPerWeek: per, platforms: plats, categories: cats, approve } }); toast(`Planned ${r.created} posts.`, "success"); onDone(); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't plan that.", "error"); } finally { setBusy(false); }
  }
  return (
    <Sheet open onClose={onClose} title="Plan my content" wide>
      <div className="space-y-5">
        <div><label className="kicker mb-1 block">Posts per week: {per}</label><input type="range" min={1} max={14} value={per} onChange={(e) => setPer(+e.target.value)} className="w-full" /></div>
        <div><label className="kicker mb-1 block">Where</label><PlatformPicker data={data} value={plats} onChange={setPlats} /></div>
        <div><label className="kicker mb-1 block">Topics (none = a good mix)</label><div className="flex flex-wrap gap-2">{groups.map((c) => <button key={c.key} onClick={() => setCats(cats.includes(c.key) ? cats.filter((x) => x !== c.key) : [...cats, c.key])} className={"chip " + (cats.includes(c.key) ? "is-selected" : "")}>{c.label}</button>)}</div></div>
        <label className="flex items-center gap-3 text-[14.5px]"><input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} /> Approve and schedule everything right away</label>
        <button className="btn btn-primary w-full" disabled={busy || !plats.length} onClick={go}>{busy ? "Planning…" : "Create plan"}</button>
      </div>
    </Sheet>
  );
}

export default function ContentPage() { return <Suspense><ContentInner /></Suspense>; }
