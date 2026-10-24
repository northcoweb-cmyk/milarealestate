"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Brain, Building2, ChevronRight, ClipboardCheck, CreditCard, FileText, FolderOpen, Home as HomeIcon, ListChecks, LogOut, Palette, Plug, Shield, Bell, SlidersHorizontal, User, Workflow, Lock, Gauge, Smartphone, Plane } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, Confirm, PageHeader, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApp } from "@/components/app-context";
import { InstallSteps, useInstall } from "@/components/install";
import { ProfileCard } from "@/components/ui/profile-card";
import { OutOfOffice } from "@/components/out-of-office";

const Row = ({ href, icon: I, title, sub }: { href: string; icon: any; title: string; sub?: string }) => (
  <Link href={href} className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-white/30 sm:px-5"><span className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}><I size={20} /></span><span className="min-w-0 flex-1"><span className="block font-semibold leading-tight">{title}</span>{sub && <span className="faint text-[13.5px]">{sub}</span>}</span><ChevronRight size={18} className="text-ink-faint" /></Link>
);
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (<section className="mb-7"><p className="kicker mb-2.5 px-2">{title}</p><div className="glass divide-y overflow-hidden" style={{ borderColor: "var(--line)" }}>{children}</div></section>);

export default function MorePage() {
  const { profile, credits, admin, toast, referralsFull } = useApp();
  const router = useRouter();
  const [clearing, setClearing] = useState(false);
  const [ooo, setOoo] = useState(false);
  const install = useInstall();
  const pct = Math.min(100, Math.round((credits.balance / Math.max(credits.allowance, 1)) * 100));
  return (
    <Page wide>
      <PageHeader title="More" />
<div className="lg:grid lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-x-6">
      <ProfileCard className="mb-7 !mx-0 !max-w-none" />

      {!referralsFull && <Link href="/refer" className="mb-7 flex flex-col justify-between gap-6 p-6 text-white lg:col-start-2 lg:row-span-2 lg:row-start-1" style={{ borderRadius: 26, background: "linear-gradient(135deg,#6d5ae6 0%,#8fa4ff 60%,#ffb98c 130%)", boxShadow: "0 14px 34px -16px rgba(80,60,200,.6)" }}><span><span className="block text-[22px] font-bold leading-tight">🎁 Refer an agent, earn credits</span><span className="mt-2 block text-[14.5px] leading-snug text-white/90">Earn 200 credits for every friend who subscribes (550 for an annual plan). They get bonus credits too.</span></span><span className="flex items-center justify-between rounded-2xl bg-white/20 px-4 py-3 text-[14.5px] font-semibold">Get your link and code<span aria-hidden>→</span></span></Link>}



</div>
<button type="button" onClick={() => setOoo(true)} className="glass mb-7 flex w-full items-center gap-4 p-4 text-left sm:p-5" style={{ borderRadius: 24 }}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }}><Plane size={22} /></span>
        <span className="min-w-0 flex-1"><span className="block text-[17px] font-semibold">Going out of office?</span><span className="muted block text-[14px]">Tell Mila the days. She blocks them, moves what&apos;s already booked, and reminds you the evening before.</span></span>
        <ChevronRight size={18} className="shrink-0 text-ink-faint" aria-hidden />
      </button>
      <OutOfOffice open={ooo} onClose={() => setOoo(false)} />
<div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
      <Group title="Mila's workspace">
        <Row href="/contacts?view=messages" icon={Mail} title="Messages & follow-ups" sub="Every email and text, and who is due a nudge" />
        <Row href="/showings" icon={ClipboardCheck} title="Showing sheets" sub="Checklist, notes, photos and video" />
        <Row href="/done" icon={ListChecks} title="Completed" sub="Everything finished, in order" />
        <Row href="/tasks" icon={ListChecks} title="To-do & approvals" sub="Overdue, due today, and what needs your OK" />
        <Row href="/memory" icon={Brain} title="Memory" sub="What Mila remembers — view, edit, delete" />
        <Row href="/workflows" icon={Workflow} title="Workflows" sub="Open house, new buyer, and more" />
        <Row href="/templates" icon={FileText} title="Templates" sub="Documents, emails and checklists" />
        <Row href="/documents" icon={FolderOpen} title="Documents" sub="Files you've shared with Mila" />
        <Row href="/properties" icon={HomeIcon} title="Properties" sub="Listings, facts and photos" />
      </Group>
      <Group title="Settings">
        <Row href="/settings/profile" icon={User} title="Profile" />
        <Row href="/settings/business" icon={Building2} title="Business" />
        <Row href="/settings/connections" icon={Plug} title="Connections" sub="Gmail and your calendar" />
        <Row href="/settings/mila" icon={SlidersHorizontal} title="Mila" sub="Autonomy: what Mila can do on her own" />
        <Row href="/settings/notifications" icon={Bell} title="Notifications" />
        <Row href="/settings/credits" icon={CreditCard} title="Credits & billing" />
        <Row href="/refer" icon={Smartphone} title="Invite & earn" sub="Your link, your code, and your invites" />
        <Row href="/settings/support" icon={Bell} title="Help & support" sub="Send us a ticket, we reply in 48 to 72 hours" />
        <Row href="/settings/appearance" icon={Palette} title="Appearance" />
        <Row href="/settings/privacy" icon={Shield} title="Privacy" />
        <Row href="/settings/security" icon={Lock} title="Security" />
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("mila:bug", { detail: {} }))} className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-white/30 sm:px-5"><span className="flex h-10 w-10 items-center justify-center rounded-2xl text-[20px]" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }} aria-hidden>🐞</span><span className="min-w-0 flex-1"><span className="block font-semibold leading-tight">Report a bug</span><span className="faint block text-[13.5px]">Something wrong or confusing? Tell us.</span></span></button>
        {admin && <Row href="/admin" icon={Gauge} title="Owner dashboard" sub="Credit costs, pricing and margins" />}
      </Group>
</div>

      <div className="mx-auto lg:max-w-xl">
      {install.mobile && !install.standalone && <section id="install" className="glass mb-5 p-5"><p className="mb-1 flex items-center gap-2 font-semibold"><Smartphone size={18} />Add Mila to your Home Screen</p><p className="muted mb-3 text-[14px]">For the full experience — it opens like a real app.</p>{install.deferred ? <button className="btn btn-primary btn-sm" onClick={install.install}>Install</button> : <InstallSteps platform={install.platform} />}</section>}

      {profile.is_demo && <button className="btn btn-quiet mb-3 w-full" onClick={() => setClearing(true)}>Remove sample data</button>}
      <Confirm open={clearing} danger title="Remove all sample data?" body="Deletes the fictional contacts, properties, appointments and tasks that came with the demo, plus anything attached to them. Your own records stay." confirmLabel="Remove sample data" onClose={() => setClearing(false)}
        onConfirm={async () => { setClearing(false); try { const r = await jfetch<{ removed: number }>("/api/me/remove-sample-data", { method: "POST" }); toast(r.removed ? "Sample data removed." : "There was no sample data to remove.", "success"); router.refresh(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't remove it.", "error"); } }} />
      <button className="btn w-full" onClick={async () => { await jfetch("/api/auth/logout", { method: "POST" }); window.location.replace("/welcome"); }}><LogOut size={18} />Sign out</button>
      <Version />
      {profile.is_demo && <p className="faint mt-4 text-center text-[12.5px]">You're using fictional demo data.</p>}
      </div>
    </Page>
  );
}

/** The build this screen is running, so "is the new version live?" has a one-glance answer. */
function Version() {
  const [v, setV] = useState("");
  useEffect(() => { fetch("/api/version", { cache: "no-store" }).then((r) => r.json()).then((j) => setV(String(j.commit ?? ""))).catch(() => {}); }, []);
  return v ? <p className="faint mt-4 text-center text-[12.5px]">Version {v}</p> : null;
}
