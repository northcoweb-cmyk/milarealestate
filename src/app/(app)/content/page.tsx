"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Sparkles, Plus, Copy, Share2, Trash2, Download, ChevronDown, ImagePlus } from "lucide-react";
import { uploadMedia } from "@/lib/media-upload";
import type { SocialPlatform, SocialPost, SocialSlide } from "@/lib/types";
import { Confirm, Empty, PageHeader, Pill, Sheet, Skeleton, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";
import { SlideImage, PLATFORM_META, PlatformBadge, STATUS_META, toLocalInput } from "@/components/content/shared";
import { downloadBlob, renderPostFiles, shareOrDownload, type Brand } from "@/lib/content/render";
import { LAYOUTS, PALETTES, layoutOf, paletteOf } from "@/lib/content/design";
import { fileEntry, makeZip } from "@/lib/content/zip";

type Tab = "drafts" | "ready" | "scheduled" | "posted";
interface Data {
  posts: SocialPost[]; photos: Record<string, string[]>; uploads: string[]; counts: Record<Tab | "archived", number>;
  properties: { id: string; address: string; verified: boolean }[];
  categories: { key: string; label: string; blurb: string; needsProperty: boolean; group: string }[];
  platforms: { key: SocialPlatform; label: string; limit: number }[]; tz: string; ai: boolean;
}
const TABS: { key: Tab; label: string }[] = [{ key: "drafts", label: "Drafts" }, { key: "ready", label: "Ready" }, { key: "scheduled", label: "Planned" }, { key: "posted", label: "Posted" }];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "post";

/** Downloads one post: a PNG for a single image, a ZIP (with the caption) for a carousel. */
async function downloadPost(post: SocialPost, brand: Brand) {
  const files = await renderPostFiles(post, brand);
  if (files.length === 1) { downloadBlob(files[0], files[0].name); return; }
  const entries = [...(await Promise.all(files.map((f) => fileEntry(f.name, f)))), { name: "caption.txt", data: new TextEncoder().encode(`${post.caption}\n\n${post.hashtags.join(" ")}`) }];
  downloadBlob(makeZip(entries), `${post.platform}-${slug(post.category ?? "post")}.zip`);
}

function ContentInner() {
  const params = useSearchParams();
  const initial = (params.get("tab") as Tab) || "drafts";
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === initial) ? initial : "drafts");
  const [platform, setPlatform] = useState<SocialPlatform | "">("");
  const { data, loading, reload } = useApi<Data>(`/api/content?status=${tab}${platform ? `&platform=${platform}` : ""}`);
  const [open, setOpen] = useState<SocialPost | null>(null);
  const [creating, setCreating] = useState(false);
  const [planning, setPlanning] = useState(params.get("plan") === "1");
  const { toast, profile } = useApp();
  const [busy, setBusy] = useState(false);
  const [zipProgress, setZipProgress] = useState<string | null>(null);
  const posts = data?.posts ?? [];
  const pfpId = profile.settings.brand?.pfp ?? null;
  const brand: Brand = useMemo(() => ({ name: profile.full_name, brokerage: profile.brokerage, pfp: pfpId ? `/api/files/${pfpId}` : null }), [profile.full_name, profile.brokerage, pfpId]);
  useEffect(() => { setOpen((o) => (o ? posts.find((p) => p.id === o.id) ?? null : o)); }, [posts]);

  async function approveAll() {
    setBusy(true);
    try { const r = await jfetch<{ scheduled?: number }>("/api/content/bulk", { method: "POST", json: { action: "approve_schedule", ids: posts.map((p) => p.id) } }); toast(`Planned ${r.scheduled ?? posts.length} posts.`, "success"); reload(); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't plan those.", "error"); } finally { setBusy(false); }
  }
  async function downloadAll() {
    if (!posts.length) return;
    try {
      const entries = [];
      for (let i = 0; i < posts.length; i++) {
        setZipProgress(`Making images ${i + 1} of ${posts.length}…`);
        const p = posts[i]; const folder = `${String(i + 1).padStart(2, "0")}-${p.platform}-${slug(p.category ?? "post")}`;
        for (const f of await renderPostFiles(p, brand)) entries.push(await fileEntry(`${folder}/${f.name}`, f));
        entries.push({ name: `${folder}/caption.txt`, data: new TextEncoder().encode(`${p.caption}\n\n${p.hashtags.join(" ")}`) });
      }
      downloadBlob(makeZip(entries), `mila-posts-${new Date().toISOString().slice(0, 10)}.zip`);
      toast(`Downloaded ${posts.length} post${posts.length === 1 ? "" : "s"} with captions.`, "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't make the download.", "error"); } finally { setZipProgress(null); }
  }

  return (
    <Page wide>
      <PageHeader title="Content" sub="Mila designs the posts. You post them." right={<div className="flex gap-2"><button className="btn btn-quiet btn-sm" onClick={() => setPlanning(true)}><Sparkles size={16} /> Plan</button><button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Plus size={16} /> New</button></div>} />

      {!profile.settings.brand?.credentials?.trim() && (
        <Link href="/settings/profile" className="glass mb-4 flex items-center gap-3 p-4" style={{ borderRadius: 22 }}>
          <span className="text-[22px]" aria-hidden>✍️</span>
          <span className="min-w-0 flex-1 text-[14.5px] leading-snug"><b>Add your signature and photo.</b> Every caption ends with your name, license credentials, phone and brokerage — set it up once.</span>
          <span className="shrink-0 text-[13.5px] font-semibold text-accent">Set up</span>
        </Link>
      )}
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        {TABS.map((t) => <button key={t.key} onClick={() => setTab(t.key)} className={"chip " + (tab === t.key ? "is-selected" : "")}>{t.label}{data ? ` · ${data.counts[t.key]}` : ""}</button>)}
      </div>
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        <button onClick={() => setPlatform("")} className={"chip " + (!platform ? "is-selected" : "")}>All</button>
        {(data?.platforms ?? []).map((p) => <button key={p.key} onClick={() => setPlatform(p.key)} className={"chip " + (platform === p.key ? "is-selected" : "")}>{p.label}</button>)}
      </div>

      {posts.length > 0 && (
        <div className="glass mb-4 flex flex-wrap items-center justify-between gap-3 p-4" style={{ borderRadius: 22 }}>
          <p className="text-[14.5px] leading-snug">{tab === "drafts" ? `${posts.length} draft${posts.length === 1 ? "" : "s"} to review` : `${posts.length} post${posts.length === 1 ? "" : "s"}`}<span className="faint block text-[12.5px]">Tap a post, share it to your phone, then post it in the app.</span></p>
          <div className="flex gap-2">
            <button className="btn btn-sm" disabled={!!zipProgress} onClick={downloadAll}><Download size={16} />{zipProgress ?? "Download all"}</button>
            {tab === "drafts" && posts.length > 1 && <button className="btn btn-primary btn-sm" disabled={busy} onClick={approveAll}>{busy ? "Working…" : "Approve all"}</button>}
          </div>
        </div>
      )}

      {loading && !data ? <div className="space-y-3"><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
        : posts.length === 0 ? <Empty title={tab === "drafts" ? "No drafts yet" : `Nothing ${tab === "scheduled" ? "planned" : tab} yet`} body="Tap New for a single post, or Plan to have Mila fill your week." action={<button className="btn btn-primary" onClick={() => setCreating(true)}>Create a post</button>} />
        
        : <ul className="grid gap-3 lg:grid-cols-2">{posts.map((p) => (
          <li key={p.id}><button onClick={() => setOpen(p)} className="glass flex w-full gap-3.5 p-3 text-left" style={{ borderRadius: 24 }}>
            <SlideImage slide={p.slides[0] ?? { role: "hero", headline: p.caption.split("\n")[0] }} index={0} total={p.slides.length || 1} post={p} brand={brand} width={300} className="w-[96px] shrink-0 self-start" rounded={14} />
            <div className="min-w-0 flex-1 py-0.5">
              <div className="mb-1.5 flex flex-wrap items-center gap-2"><PlatformBadge platform={p.platform} size={22} /><Pill tone={STATUS_META[p.status]?.tone}>{STATUS_META[p.status]?.label}</Pill>{p.slides.length > 1 && <span className="faint text-[12px]">{p.slides.length} images</span>}{p.stale && <Pill tone="warn">Outdated</Pill>}</div>
              <p className="line-clamp-3 text-[14.5px] leading-snug">{p.caption}</p>
              {p.scheduled_for && <p className="faint mt-1 text-[12.5px]">{new Intl.DateTimeFormat("en-US", { timeZone: data?.tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(p.scheduled_for))}</p>}
            </div>
          </button></li>))}</ul>}

      {open && data && <Editor post={open} data={data} brand={brand} onClose={() => setOpen(null)} onChanged={reload} />}
      {creating && data && <NewPost data={data} onClose={() => setCreating(false)} onDone={() => { setCreating(false); setTab("drafts"); reload(); }} />}
      {planning && data && <PlanSheet data={data} onClose={() => setPlanning(false)} onDone={() => { setPlanning(false); setTab("drafts"); reload(); }} />}
    </Page>
  );
}

function Editor({ post, data, brand, onClose, onChanged }: { post: SocialPost; data: Data; brand: Brand; onClose: () => void; onChanged: () => void }) {
  const { toast } = useApp();
  const [caption, setCaption] = useState(post.caption);
  const [slides, setSlides] = useState<SocialSlide[]>(post.slides);
  const [when, setWhen] = useState(toLocalInput(post.scheduled_for, data.tz));
  const [busy, setBusy] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const [editText, setEditText] = useState(false);
  const limit = data.platforms.find((p) => p.key === post.platform)?.limit ?? 2200;
  const over = caption.length > limit;
  const theme = slides[0]?.theme ?? "noir";
  const photos = post.property_id ? data.photos[post.property_id] ?? [] : Object.values(data.photos).flat();
  const [target, setTarget] = useState<number | "all">(0);
  const [uploads, setUploads] = useState<string[]>(data.uploads ?? []);
  const [uploading, setUploading] = useState(false);
  const [link, setLink] = useState("");
  const [pulling, setPulling] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const propInfo = data.properties.find((x) => x.id === post.property_id);
  const dirty = caption !== post.caption || JSON.stringify(slides) !== JSON.stringify(post.slides);
  const live: SocialPost = { ...post, caption, slides };

  const setTheme = (t: string) => setSlides((x) => x.map((s) => ({ ...s, theme: t })));
  const layout = layoutOf(slides[0]?.layout).key;
  const hasPhoto = slides.some((s) => s.image_url);
  const setLayout = (l: string) => setSlides((x) => x.map((s) => ({ ...s, layout: l })));
  // photo shown on the slide(s) being edited
  const shown = target === "all" ? (slides.every((s) => s.image_url === slides[0]?.image_url) ? slides[0]?.image_url ?? null : undefined) : slides[target]?.image_url ?? null;
  const setPhoto = (url: string | null) => setSlides((x) => x.map((s, i) => (target === "all" || target === i ? { ...s, image_url: url } : s)));
  const library = [...new Set([...photos, ...uploads])];
  async function addFiles(files: FileList | null) {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)).slice(0, 8);
    if (!list.length) { toast("Choose a photo (JPG, PNG or HEIC).", "error"); return; }
    setUploading(true);
    try {
      const made: string[] = [];
      for (const f of list) made.push((await uploadMedia(f, {})).url);
      setUploads((u) => [...made, ...u.filter((x) => !made.includes(x))]);
      setSlides((x) => x.map((s, i) => {
        if (target === "all") return { ...s, image_url: made[i % made.length] }; // several photos spread across the images
        return target === i ? { ...s, image_url: made[0] } : s;
      }));
      toast(made.length === 1 ? "Photo added." : `${made.length} photos added.`, "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't upload that photo.", "error"); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function pullFromLink(e: React.FormEvent) {
    e.preventDefault();
    if (!post.property_id || !link.trim()) return;
    setPulling(true);
    try { const r = await jfetch<{ message: string; added: number }>(`/api/properties/${post.property_id}/pull-photos`, { method: "POST", json: { url: link.trim() } }); toast(r.message, r.added ? "success" : "info"); if (r.added) { setLink(""); onChanged(); } }
    catch (er) { toast(er instanceof Error ? er.message : "Couldn't read that link.", "error"); } finally { setPulling(false); }
  }
  const setText = (i: number, k: "headline" | "sub", v: string) => setSlides((x) => x.map((s, n) => (n === i ? { ...s, [k]: v } : s)));

  async function act(action: string | null, extra: Record<string, unknown> = {}, msg?: string) {
    setBusy(action ?? "save");
    try {
      const body: Record<string, unknown> = { ...(action ? { action } : {}), ...extra };
      if (caption !== post.caption) body.caption = caption;
      if (JSON.stringify(slides) !== JSON.stringify(post.slides)) body.slides = slides;
      await jfetch(`/api/content/${post.id}`, { method: "PATCH", json: body });
      if (msg) toast(msg, "success");
      onChanged(); if (action !== "regenerate" && action !== null) onClose();
    } catch (e) { toast(e instanceof Error ? e.message : "That didn't work.", "error"); } finally { setBusy(null); }
  }
  async function share() {
    setBusy("share");
    try { const files = await renderPostFiles(live, brand); const r = await shareOrDownload(files, caption); if (r === "downloaded") toast("Images saved. Caption copied.", "success"); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't make the images.", "error"); } finally { setBusy(null); }
  }
  async function download() {
    setBusy("download");
    try { await downloadPost(live, brand); toast("Downloaded.", "success"); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't make the images.", "error"); } finally { setBusy(null); }
  }
  const st = post.status;
  const pal = paletteOf(theme);
  return (
    <Sheet open onClose={onClose} title={PLATFORM_META[post.platform].label + " post"} wide>
      <div className="space-y-5">
        <div className="no-scrollbar -mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-1">
          {slides.map((s, i) => <SlideImage key={i} slide={s} index={i} total={slides.length} post={post} brand={brand} width={640} rounded={20} className={"shrink-0 snap-center " + (post.platform === "x" || post.platform === "linkedin" ? "w-[88%]" : "w-[66%] sm:w-[48%]")} />)}
        </div>

        <div>
          <p className="kicker mb-2">Design · {layoutOf(layout).label}</p>
          <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
            {LAYOUTS.filter((l) => hasPhoto || l.photo !== "yes").map((l) => <button key={l.key} onClick={() => setLayout(l.key)} aria-pressed={layout === l.key} className={"chip " + (layout === l.key ? "is-selected" : "")}>{l.label}</button>)}
          </div>
        </div>

        <div>
          <p className="kicker mb-2">Colors · {pal.label}</p>
          <div className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 py-1">
            {PALETTES.map((p) => <button key={p.key} onClick={() => setTheme(p.key)} aria-label={`${p.label} style`} aria-pressed={theme === p.key} className="relative h-11 w-11 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg, ${p.bg} 55%, ${p.accent} 55%)`, boxShadow: theme === p.key ? "0 0 0 3px var(--surface), 0 0 0 5px var(--ink)" : "inset 0 0 0 1px rgba(128,128,128,.4)" }} />)}
          </div>
        </div>

        <div>
          <p className="kicker mb-2">Photos</p>
          <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 py-1" role="tablist" aria-label="Which image to put a photo on">
            {slides.length > 1 && <button role="tab" aria-selected={target === "all"} className={"chip shrink-0 " + (target === "all" ? "is-selected" : "")} onClick={() => setTarget("all")}>All images</button>}
            {slides.map((s, i) => <button key={i} role="tab" aria-selected={target === i} className={"chip shrink-0 " + (target === i ? "is-selected" : "")} onClick={() => setTarget(i)}>Image {i + 1}{s.image_url ? " ✓" : ""}</button>)}
          </div>
          <div className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 py-1">
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11.5px] font-semibold" style={{ boxShadow: "inset 0 0 0 1.5px var(--line-strong, var(--line))" }} aria-label="Add a photo from your phone or computer"><ImagePlus size={20} />{uploading ? "…" : "Add"}</button>
            <button onClick={() => setPhoto(null)} aria-pressed={shown === null} className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-[12.5px] font-semibold" style={{ boxShadow: shown === null ? "0 0 0 2px var(--ink)" : "inset 0 0 0 1.5px var(--line)" }}>None</button>
            {library.map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <button key={u} onClick={() => setPhoto(u)} aria-pressed={shown === u} className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl" style={{ boxShadow: shown === u ? "0 0 0 2px var(--ink)" : "none" }}><img src={u} alt="Your photo" className="h-full w-full object-cover" loading="lazy" /></button>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          <p className="faint mt-2 text-[12.5px]">{library.length ? "Tap a photo to put it on the selected image." : "Add your own photos — a listing shot, a headshot, a neighborhood picture."}</p>
          {post.property_id && (
            <form className="mt-3 flex gap-2" onSubmit={pullFromLink}>
              <input className="field flex-1" inputMode="url" placeholder="…or paste the listing link to pull its photos" value={link} onChange={(e) => setLink(e.target.value)} aria-label="Listing link" />
              <button className="btn btn-sm" disabled={pulling || !link.trim()}>{pulling ? "Pulling…" : "Pull"}</button>
            </form>
          )}
        </div>

        {propInfo && !propInfo.verified && <p className="rounded-2xl p-3 text-[13.5px]" style={{ background: "color-mix(in srgb, var(--warn) 14%, transparent)" }}>The numbers on this post come from public records or an online lookup. Check the price, beds, baths and size before you post — or confirm them on the <a className="font-semibold underline" href={`/properties/${propInfo.id}`}>property page</a> and I'll stop flagging this.</p>}

        <div>
          <p className="kicker mb-2">Caption</p>
          <textarea className="field w-full" rows={6} value={caption} onChange={(e) => setCaption(e.target.value)} aria-label="Caption" />
          <p className={"mt-1 text-right text-[12.5px] " + (over ? "text-[color:var(--danger)]" : "faint")}>{caption.length.toLocaleString()} / {limit.toLocaleString()}</p>
          {post.hashtags.length > 0 && <p className="faint text-[13px]">{post.hashtags.join(" ")}</p>}
        </div>

        <div>
          <button className="flex w-full items-center justify-between text-left" onClick={() => setEditText(!editText)} aria-expanded={editText}><span className="kicker">Edit image text</span><ChevronDown size={18} className={"transition " + (editText ? "rotate-180" : "")} /></button>
          {editText && <div className="mt-3 space-y-3">{slides.map((s, i) => (
            <div key={i} className="grid gap-2"><p className="faint text-[12.5px]">Image {i + 1}</p>
              <input className="field" value={s.headline} maxLength={120} onChange={(e) => setText(i, "headline", e.target.value)} aria-label={`Image ${i + 1} headline`} />
              <input className="field" value={s.sub ?? ""} maxLength={160} onChange={(e) => setText(i, "sub", e.target.value)} placeholder="Small line (optional)" aria-label={`Image ${i + 1} small line`} /></div>))}</div>}
        </div>

        {dirty && <button className="btn btn-primary w-full" disabled={!!busy || over} onClick={() => act(null, {}, "Saved.")}>{busy === "save" ? "Saving…" : "Save changes"}</button>}

        {st !== "published" && st !== "archived" && (
          <div><label className="kicker mb-1 block">Plan for</label><div className="flex gap-2"><input type="datetime-local" className="field flex-1" value={when} onChange={(e) => setWhen(e.target.value)} /><button className="btn btn-sm" disabled={!when || !!busy || over} onClick={() => act("schedule", { scheduled_for: when }, "Planned. Mila will remind you.")}>{busy === "schedule" ? "…" : "Plan"}</button></div></div>
        )}

        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={share}><Share2 size={15} /> {busy === "share" ? "Making…" : "Share to phone"}</button>
          <button className="btn btn-sm" disabled={!!busy} onClick={download}><Download size={15} /> {busy === "download" ? "Making…" : slides.length > 1 ? "Download images" : "Download image"}</button>
          <button className="btn btn-quiet btn-sm" onClick={() => { navigator.clipboard?.writeText(caption); toast("Caption copied.", "success"); }}><Copy size={15} /> Copy caption</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(st === "draft" || st === "pending_approval") && <button className="btn btn-sm" disabled={!!busy || over} onClick={() => act("ready", {}, "Ready to post.")}>Approve</button>}
          {st !== "published" && st !== "archived" && <button className="btn btn-sm" disabled={!!busy} onClick={() => act("posted", {}, "Marked as posted.")}>Mark posted</button>}
          {(st === "scheduled" || st === "approved_unpublished") && <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => act("draft")}>Back to draft</button>}
          {st !== "published" && <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => act("regenerate", {}, "Fresh version ready.")}>{busy === "regenerate" ? "Writing…" : "Rewrite"}</button>}
          {st === "archived" ? <button className="btn btn-quiet btn-sm" onClick={() => act("unarchive")}>Restore</button> : <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => act("archive")}>Archive</button>}
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
