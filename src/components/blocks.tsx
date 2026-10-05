"use client";

import { ListingRail } from "./listing-cards";
import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, Check, ChevronDown, Circle, Clock, MapPin, X, Info, CheckCircle2 } from "lucide-react";
import type { ActionButton, Block } from "@/lib/types";
import { Avatar, jfetch } from "./ui";
import { useApp } from "./app-context";
import { type Compose, gmailUrl, isTooLongForLink, mailtoUrl } from "@/lib/mailto";
import { LiquidGlassCard } from "./ui/liquid-weather-glass";
import clsx from "clsx";

type OnAction = (a: NonNullable<ActionButton["action"]>) => void;
interface Props { block: Block; onAction: OnAction; onApprove: (id: string) => void; onNavigate: (href: string) => void; busy?: boolean }

function Buttons({ buttons, onAction, onApprove, onNavigate, busy }: { buttons?: ActionButton[] } & Omit<Props, "block">) {
  if (!buttons?.length) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2.5">
      {buttons.map((b, i) => (
        <button key={i} disabled={busy} className={clsx("btn btn-sm !min-h-[42px]", b.style === "primary" && "btn-primary", b.style === "quiet" && "btn-quiet")}
          onClick={() => (b.approvalId ? onApprove(b.approvalId) : b.action ? onAction(b.action) : b.href ? onNavigate(b.href) : undefined)}>{b.label}</button>
      ))}
    </div>
  );
}

const STATE_ICON = {
  done: <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--ok) 18%, transparent)", color: "var(--ok)" }}><Check size={14} strokeWidth={3} /></span>,
  needs_approval: <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--warn) 20%, transparent)", color: "var(--warn)" }}><Clock size={13} strokeWidth={2.6} /></span>,
  pending: <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--ink) 8%, transparent)", color: "var(--ink-faint)" }}><Circle size={9} strokeWidth={3} /></span>,
  skipped: <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--ink) 8%, transparent)", color: "var(--ink-faint)" }}><Circle size={9} strokeWidth={3} /></span>,
  failed: <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--danger) 16%, transparent)", color: "var(--danger)" }}><X size={13} strokeWidth={3} /></span>,
} as const;

export function BlockView(p: Props) {
  const { block: b } = p;
  const btns = { onAction: p.onAction, onApprove: p.onApprove, onNavigate: p.onNavigate, busy: p.busy };
  switch (b.type) {
    case "workflow":
      return (
        <LiquidGlassCard className="p-5 sm:p-6" borderRadius="28px" glowIntensity="md" shadowIntensity="sm">
          <p className="kicker">{b.kicker}</p>
          <h3 className="display mt-1 text-[32px]">{b.title}</h3>
          <p className="muted mt-0.5 text-[15px]">{b.subtitle}</p>
          <ul className="mt-5 space-y-3">
            {b.items.map((it, i) => (
              <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.06 * i, duration: 0.3 }} className="flex items-start gap-3">
                {STATE_ICON[it.state]}
                <div className="min-w-0 flex-1">
                  <p className="text-[15.5px] font-medium leading-snug">{it.label}</p>
                  {it.detail && <p className="faint text-[13.5px]">{it.detail}</p>}
                </div>
              </motion.li>
            ))}
          </ul>
          {b.footer && <p className="muted hairline mt-5 pt-4 text-[14.5px]">{b.footer}</p>}
          <Buttons buttons={b.buttons} {...btns} />
        </LiquidGlassCard>
      );
    case "notice": {
      const tone = { info: "var(--accent)", warn: "var(--warn)", error: "var(--danger)", success: "var(--ok)" }[b.tone];
      const Icon = { info: Info, warn: AlertTriangle, error: AlertTriangle, success: CheckCircle2 }[b.tone];
      return (
        <div className="glass p-4 sm:p-5" style={{ borderRadius: 24 }}>
          <div className="flex gap-3"><Icon size={20} style={{ color: tone, flexShrink: 0, marginTop: 2 }} /><div className="min-w-0"><p className="font-semibold">{b.title}</p>{b.body && <p className="muted mt-0.5 whitespace-pre-line text-[14.5px]">{b.body}</p>}</div></div>
          <Buttons buttons={b.buttons} {...btns} />
        </div>
      );
    }
    case "choice":
      return (
        <div className="glass-strong p-5" style={{ borderRadius: 26 }}>
          <p className="font-semibold">{b.title}</p>
          {b.body && <p className="muted mt-0.5 text-[14.5px]">{b.body}</p>}
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
            {b.buttons.map((x, i) => (
              <button key={i} disabled={p.busy} className={clsx("btn", x.style === "primary" && "btn-primary", x.style === "quiet" && "btn-quiet")} onClick={() => (x.approvalId ? p.onApprove(x.approvalId) : x.action ? p.onAction(x.action) : x.href ? p.onNavigate(x.href) : undefined)}>{x.label}</button>
            ))}
          </div>
        </div>
      );
    case "contacts":
      return (
        <div className="glass p-4 sm:p-5">
          <p className="kicker mb-3">{b.title}</p>
          <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
            {b.contacts.map((c) => (
              <li key={c.id}>
                <Link href={`/contacts/${c.id}`} className="flex items-center gap-3 py-2.5">
                  <Avatar name={c.name} color={c.color} size={38} />
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold leading-tight">{c.name}</p><p className="faint truncate text-[13px]">{c.type}{c.reason ? ` · ${c.reason}` : ""}</p></div>
                </Link>
              </li>
            ))}
          </ul>
          <Buttons buttons={b.buttons} {...btns} />
        </div>
      );
    case "priorities": {
      const label = { urgent: "URGENT", important: "IMPORTANT", upcoming: "UPCOMING", low: "LOW PRIORITY" } as const;
      const dot = { urgent: "var(--danger)", important: "var(--warn)", upcoming: "var(--accent)", low: "var(--ink-faint)" } as const;
      return (
        <div className="glass-strong space-y-5 p-5 sm:p-6">
          {b.groups.map((g) => (
            <div key={g.priority}>
              <p className="kicker mb-2 flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: dot[g.priority] }} />{label[g.priority]}</p>
              <ul className="space-y-1">
                {g.items.map((it) => {
                  const inner = <><p className="font-semibold leading-tight">{it.title}</p>{it.subtitle && <p className="muted text-[14px]">{it.subtitle}</p>}{it.reason && <p className="faint text-[12.5px]">{it.reason}</p>}</>;
                  return <li key={it.id} className="rounded-2xl px-3 py-2.5 transition hover:bg-white/30">{it.href ? <Link href={it.href} className="block">{inner}</Link> : inner}</li>;
                })}
              </ul>
            </div>
          ))}
          <Buttons buttons={b.buttons} {...btns} />
        </div>
      );
    }
    case "draft_email":
      return <EmailCard b={b} {...btns} />;
    case "draft_social":
      return (
        <div className="glass-strong p-5">
          <p className="kicker mb-3">{b.platform} · {b.status}</p>
          <div className="no-scrollbar -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
            {b.slides.map((s, i) => <SlidePreview key={i} slide={s} index={i} total={b.slides.length} />)}
          </div>
          <p className="mt-4 whitespace-pre-line text-[14.5px]">{b.caption}</p>
          <Buttons buttons={b.buttons} {...btns} />
        </div>
      );
    case "listing_brief":
      return <BriefCard b={b} {...btns} />;
    case "listings":
      return <ListingRail title={b.title} subtitle={b.subtitle} cards={b.cards} buttons={b.buttons} onAction={p.onAction} onNavigate={p.onNavigate} busy={p.busy} />;
    case "market":
      return (
        <div className="glass-strong p-5 sm:p-6">
          <p className="kicker">{b.location} · as of {b.asOf}</p>
          <h3 className="h2 mt-1">{b.title}</h3>
          <ul className="mt-4 space-y-2.5">{b.bullets.map((x, i) => <li key={i} className="flex gap-3 text-[15px]"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />{x}</li>)}</ul>
          <p className="faint hairline mt-4 pt-3 text-[13px]"><b>Data period:</b> {b.dataPeriod}</p>
          <p className="faint mt-1 text-[13px]"><b>Sources:</b> {b.sources.map((s, i) => <span key={s.url}>{i ? " · " : ""}<a className="underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></span>)}</p>
        </div>
      );
    case "event":
      return (
        <div className="glass flex items-center gap-4 p-4" style={{ borderRadius: 24 }}>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }}><Clock size={22} /></div>
          <div className="min-w-0"><p className="truncate font-semibold">{b.title}</p><p className="muted text-[14px]">{b.when}</p>{b.where && <p className="faint flex items-center gap-1 text-[13px]"><MapPin size={12} />{b.where}</p>}</div>
          {b.status && <span className="ml-auto text-[12px] font-bold" style={{ color: "var(--ok)" }}>{b.status.toUpperCase()}</span>}
        </div>
      );
    case "debrief":
      return (
        <div className="glass-strong p-5 sm:p-6">
          <p className="kicker">{b.greeting}</p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            {[["appointments", b.counts.appointments, "Appointments"], ["followups", b.counts.followups, "Follow-ups"], ["approvals", b.counts.approvals, "Approvals"]].map(([k, n, l]) => (
              <div key={k as string} className="rounded-2xl py-3" style={{ background: "color-mix(in srgb, var(--ink) 5%, transparent)" }}><p className="display text-[34px]">{n as number}</p><p className="faint text-[12.5px] font-semibold">{l}</p></div>
            ))}
          </div>
          {b.noticed.length > 0 && <><p className="kicker mb-2 mt-5">Mila noticed</p><ul className="space-y-2">{b.noticed.map((n, i) => <li key={i} className="text-[15px]">“{n}”</li>)}</ul></>}
          <Buttons buttons={b.buttons} {...btns} />
        </div>
      );
  }
}

function BriefCard({ b, onAction, onApprove, onNavigate, busy }: { b: Extract<Block, { type: "listing_brief" }> } & Omit<Props, "block">) {
  const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
  const go = (x?: ActionButton) => x && (x.approvalId ? onApprove(x.approvalId) : x.action ? onAction(x.action) : x.href ? onNavigate(x.href) : undefined);
  return (
    <div className="glass-strong p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="kicker mb-0.5">Listing brief</p><p className="truncate text-[18px] font-semibold leading-tight">{b.title}</p>{b.subtitle && <p className="muted truncate text-[14px]">{b.subtitle}</p>}</div>
        <div className="shrink-0 text-right"><p className="display text-[26px] leading-none">{b.done}<span className="faint text-[16px]"> / {b.total}</span></p><p className="faint text-[12px]">ready</p></div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--ink) 9%, transparent)" }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,var(--accent),var(--accent-2))" }} /></div>
      <div className="mt-4 space-y-4">
        {b.sections.map((sec) => (
          <section key={sec.label} aria-label={sec.label}>
            <p className="kicker mb-1.5">{sec.emoji} {sec.label}</p>
            <ul className="space-y-1.5">
              {sec.items.map((it, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-[3px]">{it.state === "done" ? STATE_ICON.done : it.state === "missing" ? STATE_ICON.needs_approval : STATE_ICON.pending}</span>
                  <div className="min-w-0 flex-1 text-[14.5px] leading-snug"><span className={it.state === "info" ? "muted" : ""}>{it.text}</span>
                    {it.button && <div className="mt-1.5"><button disabled={busy} className="btn btn-sm !min-h-[36px] !px-3.5 text-[13px]" onClick={() => go(it.button)}>{it.button.label}</button></div>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Buttons buttons={b.buttons} onAction={onAction} onApprove={onApprove} onNavigate={onNavigate} busy={busy} />
    </div>
  );
}

function EmailCard({ b, onAction, onApprove, onNavigate, busy }: { b: Extract<Block, { type: "draft_email" }> } & Omit<Props, "block">) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const { profile, toast } = useApp();
  // The "send" button hands the finished message to the person's own email app (they press send there).
  const approvalId = b.buttons?.find((x) => x.approvalId)?.approvalId;
  const others = (b.buttons ?? []).filter((x) => !x.approvalId);
  async function openMail(via: "app" | "gmail") {
    if (!approvalId) return;
    setWorking(true);
    try {
      const m = await jfetch<Compose>(`/api/approvals/${approvalId}/compose`, { method: "POST", json: { draftId: b.draftId, subject: b.subject, body: b.body } });
      const c: Compose = { to: m.to, bcc: m.bcc, subject: m.subject, body: m.body };
      if (isTooLongForLink(c)) { try { await navigator.clipboard.writeText(c.body); toast("The message is long, so I copied it. Paste it into the email if it looks cut off.", "info"); } catch { /* ignore */ } }
      if (via === "gmail") window.open(gmailUrl(c, profile.email), "_blank", "noopener"); else window.location.href = mailtoUrl(c);
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't open your email.", "error"); } finally { setWorking(false); }
  }
  const gmail = /@(gmail|googlemail)\.com$/i.test(profile.email);
  return (
    <div className="glass-strong p-5">
      <p className="kicker mb-2">Email · {b.status}</p>
      <dl className="space-y-1 text-[14.5px]"><div className="flex gap-2"><dt className="faint w-16 shrink-0 font-semibold">TO</dt><dd className="min-w-0 break-words">{b.to}</dd></div><div className="flex gap-2"><dt className="faint w-16 shrink-0 font-semibold">SUBJECT</dt><dd className="min-w-0 font-semibold">{b.subject}</dd></div></dl>
      <div className={clsx("relative mt-3 overflow-hidden whitespace-pre-line text-[14.5px]", !open && "max-h-24")}>
        {b.body}
        {!open && <div className="absolute inset-x-0 bottom-0 h-10" style={{ background: "linear-gradient(transparent, var(--glass-strong))" }} />}
      </div>
      <button className="btn btn-quiet btn-sm mt-1 !px-2" onClick={() => setOpen(!open)}>{open ? "Show less" : "Read full draft"}<ChevronDown size={16} className={clsx("transition", open && "rotate-180")} /></button>
      <Buttons buttons={others} onAction={onAction} onApprove={onApprove} onNavigate={onNavigate} busy={busy} />
      {approvalId && <div className="mt-2"><button className="btn btn-primary btn-sm" disabled={working || busy} onClick={() => openMail("app")}>{working ? "Opening…" : "Open in email app"}</button>{gmail && <button type="button" className="btn btn-quiet btn-sm ml-1" disabled={working} onClick={() => openMail("gmail")}>Use Gmail</button>}</div>}
    </div>
  );
}

export function SlidePreview({ slide, index, total }: { slide: { headline: string; sub?: string; role: string; image_id?: string | null }; index: number; total: number }) {
  const grad = ["linear-gradient(160deg,#111,#4a4a4d 60%,#9a9a9e)", "linear-gradient(160deg,#1c1c1e,#58585b 70%,#b0b0b4)", "linear-gradient(160deg,#000,#38383a 60%,#8a8a8e)"][index % 3];
  return (
    <div className="relative w-[210px] shrink-0 snap-start overflow-hidden text-white" style={{ aspectRatio: "4 / 5", borderRadius: 22, background: slide.image_id ? `url(/api/files/${slide.image_id}) center/cover` : grad, boxShadow: "var(--shadow)" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,16,48,.08), rgba(10,16,48,.62))" }} />
      <div className="absolute inset-x-0 bottom-0 p-4">
        {slide.role === "hero" && <p className="mb-1 text-[10px] font-bold tracking-[.16em] opacity-85">OPEN HOUSE</p>}
        <p className="display text-[24px] leading-[1.05]">{slide.headline}</p>
        {slide.sub && <p className="mt-1 text-[12px] opacity-90">{slide.sub}</p>}
      </div>
      {!slide.image_id && slide.role === "hero" && <p className="absolute left-4 top-4 rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold">Add photos to finish</p>}
      <p className="absolute right-3 top-3 text-[10px] font-semibold opacity-80">{index + 1}/{total}</p>
    </div>
  );
}
