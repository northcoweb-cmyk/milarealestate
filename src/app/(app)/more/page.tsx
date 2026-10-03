"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain, Building2, ChevronRight, ClipboardCheck, CreditCard, FileText, FolderOpen, Home as HomeIcon, ListChecks, LogOut, Palette, Plug, Shield, Bell, SlidersHorizontal, User, Workflow, Lock, Gauge, Smartphone } from "lucide-react";
import { useState } from "react";
import { Avatar, Confirm, PageHeader, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApp } from "@/components/app-context";
import { InstallSteps, useInstall } from "@/components/install";

const Row = ({ href, icon: I, title, sub }: { href: string; icon: any; title: string; sub?: string }) => (
  <Link href={href} className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-white/30 sm:px-5"><span className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}><I size={20} /></span><span className="min-w-0 flex-1"><span className="block font-semibold leading-tight">{title}</span>{sub && <span className="faint text-[13.5px]">{sub}</span>}</span><ChevronRight size={18} className="text-ink-faint" /></Link>
);
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (<section className="mb-7"><p className="kicker mb-2.5 px-2">{title}</p><div className="glass divide-y overflow-hidden" style={{ borderColor: "var(--line)" }}>{children}</div></section>);

export default function MorePage() {
  const { profile, credits, admin, toast } = useApp();
  const router = useRouter();
  const [clearing, setClearing] = useState(false);
  const install = useInstall();
  const pct = Math.min(100, Math.round((credits.balance / Math.max(credits.allowance, 1)) * 100));
  return (
    <Page>
      <PageHeader title="More" />
      <Link href="/settings/profile" className="glass-strong mb-7 flex items-center gap-4 p-5"><Avatar name={profile.full_name} size={56} src={profile.settings.brand?.pfp ? `/api/files/${profile.settings.brand.pfp}` : null} /><div className="min-w-0 flex-1"><p className="text-[19px] font-semibold leading-tight">{profile.full_name}</p><p className="muted truncate text-[14.5px]">{profile.email}</p></div><ChevronRight className="text-ink-faint" /></Link>

      <Link href="/settings/credits" className="glass mb-7 block p-5" style={{ borderRadius: 26 }}>
        <div className="mb-2 flex items-baseline justify-between"><p className="kicker">Mila credits</p><span className="faint text-[13px]">Resets {new Date(credits.resetsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></div>
        <p className="display text-[34px] leading-none">{credits.balance.toLocaleString()} <span className="faint text-[18px]">/ {credits.allowance.toLocaleString()}</span></p>
        <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--ink) 9%, transparent)" }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,var(--accent),var(--accent-2))" }} /></div>
      </Link>

      <Group title="Mila's workspace">
        <Row href="/showings" icon={ClipboardCheck} title="Showing sheets" sub="Checklist, notes, photos and video" />
        <Row href="/done" icon={ListChecks} title="Completed" sub="Everything finished, in order" />
        <Row href="/tasks" icon={ListChecks} title="Tasks & approvals" sub="Everything Mila prepared for you" />
        <Row href="/memory" icon={Brain} title="Memory" sub="What Mila remembers — view, edit, delete" />
        <Row href="/workflows" icon={Workflow} title="Workflows" sub="Open house, new buyer, and more" />
        <Row href="/templates" icon={FileText} title="Templates" sub="Documents, emails and checklists" />
        <Row href="/documents" icon={FolderOpen} title="Documents" sub="Files you've shared with Mila" />
        <Row href="/properties/all" icon={HomeIcon} title="Properties" sub="Listings, facts and photos" />
      </Group>
      <Group title="Settings">
        <Row href="/settings/profile" icon={User} title="Profile" />
        <Row href="/settings/business" icon={Building2} title="Business" />
        <Row href="/settings/connections" icon={Plug} title="Connections" sub="Google, and what's coming" />
        <Row href="/settings/mila" icon={SlidersHorizontal} title="Mila" sub="Autonomy: what Mila can do on her own" />
        <Row href="/settings/notifications" icon={Bell} title="Notifications" />
        <Row href="/settings/credits" icon={CreditCard} title="Credits & billing" />
        <Row href="/settings/appearance" icon={Palette} title="Appearance" />
        <Row href="/settings/privacy" icon={Shield} title="Privacy" />
        <Row href="/settings/security" icon={Lock} title="Security" />
        {admin && <Row href="/admin" icon={Gauge} title="Owner dashboard" sub="Credit costs, pricing and margins" />}
      </Group>

      {!install.standalone && <section id="install" className="glass mb-5 p-5"><p className="mb-1 flex items-center gap-2 font-semibold"><Smartphone size={18} />Add Mila to your Home Screen</p><p className="muted mb-3 text-[14px]">For the full experience — it opens like a real app.</p>{install.deferred ? <button className="btn btn-primary btn-sm" onClick={install.install}>Install</button> : <InstallSteps platform={install.platform} />}</section>}

      {profile.is_demo && <button className="btn btn-quiet mb-3 w-full" onClick={() => setClearing(true)}>Remove sample data</button>}
      <Confirm open={clearing} danger title="Remove all sample data?" body="Deletes the fictional contacts, properties, appointments and tasks that came with the demo, plus anything attached to them. Your own records stay." confirmLabel="Remove sample data" onClose={() => setClearing(false)}
        onConfirm={async () => { setClearing(false); try { const r = await jfetch<{ removed: number }>("/api/me/remove-sample-data", { method: "POST" }); toast(r.removed ? "Sample data removed." : "There was no sample data to remove.", "success"); router.refresh(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't remove it.", "error"); } }} />
      <button className="btn w-full" onClick={async () => { await jfetch("/api/auth/logout", { method: "POST" }); router.replace("/welcome"); router.refresh(); }}><LogOut size={18} />Sign out</button>
      {profile.is_demo && <p className="faint mt-4 text-center text-[12.5px]">You're using fictional demo data.</p>}
    </Page>
  );
}
