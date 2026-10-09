"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Approval, CalendarEvent, EmailDraft, SocialPost } from "@/lib/types";
import { Sheet, jfetch, Skeleton } from "./ui";
import { useApp } from "./app-context";
import { SlidePreview } from "./blocks";
import { fmtDayTime } from "@/lib/time";
import { type Compose, gmailUrl, isTooLongForLink, mailtoUrl } from "@/lib/mailto";

interface Detail { approval: Approval; drafts: EmailDraft[]; post: SocialPost | null; event: CalendarEvent | null; recipients: Record<string, { name: string; email: string | null }> }

export function ReviewSheet({ approvalId, onClose, onChanged }: { approvalId: string | null; onClose: () => void; onChanged: () => void }) {
  const { toast, profile } = useApp();
  const [d, setD] = useState<Detail | null>(null);
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [idx, setIdx] = useState(0);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!approvalId) { setD(null); return; }
    setD(null); setEdits({}); setIdx(0); setOpened({});
    jfetch<Detail>(`/api/approvals/${approvalId}`).then((r) => { setD(r); setCaption(r.post?.caption ?? ""); }).catch((e) => { toast(e.message, "error"); onClose(); });
  }, [approvalId]); // eslint-disable-line react-hooks/exhaustive-deps

  const a = d?.approval;
  const draft = d?.drafts[idx];
  const cur = draft ? edits[draft.id] ?? { subject: draft.subject, body: draft.body } : null;
  const recipientNames = (x: EmailDraft) => [...x.to_contact_ids.map((id) => d?.recipients[id]).filter(Boolean).map((r) => r!.name), ...x.to_emails];
  const total = d?.drafts.reduce((n, x) => n + recipientNames(x).length, 0) ?? 0;

  async function decide(decision: "approve" | "reject") {
    if (!a) return;
    setBusy(true);
    try {
      const r = await jfetch<{ message: string; ok: boolean; code?: string }>(`/api/approvals/${a.id}`, { method: "POST", json: { decision, edits: Object.entries(edits).map(([draftId, v]) => ({ draftId, ...v })), postId: d?.post?.id, caption: d?.post ? caption : undefined } });
      toast(r.message, r.ok ? "success" : "info"); onChanged(); onClose();
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't do that.", "error"); } finally { setBusy(false); }
  }
  const isEmail = a?.action === "send_email" || a?.action === "send_bulk_email";
  // Email goes out from the agent's own mail app: we hand over the finished message (recipient, subject, body) and they press send there.
  async function openMail(via: "app" | "gmail") {
    if (!a || !draft || !cur) return;
    setBusy(true);
    try {
      const m = await jfetch<Compose & { from: string; remaining: number; recipients: number }>(`/api/approvals/${a.id}/compose`, { method: "POST", json: { draftId: draft.id, subject: cur.subject, body: cur.body } });
      const c: Compose = { to: m.to, bcc: m.bcc, subject: m.subject, body: m.body };
      if (isTooLongForLink(c)) { try { await navigator.clipboard.writeText(c.body); toast("The message is long, so I copied it. Paste it into the email if it looks cut off.", "info"); } catch { /* ignore */ } }
      if (via === "gmail") window.open(gmailUrl(c, profile.email), "_blank", "noopener"); else window.location.href = mailtoUrl(c);
      setOpened((o) => ({ ...o, [draft.id]: true }));
      onChanged();
      if (m.remaining === 0) setTimeout(onClose, 600);
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't open your email.", "error"); } finally { setBusy(false); }
  }
  const action = a ? { send_email: "Approve & send", send_bulk_email: "Approve & send", send_sms: "Approve & send", publish_social: "Approve post", calendar_create: "Add to calendar", calendar_change: "Confirm change", calendar_cancel: "Confirm cancel", send_document: "Approve & send", delete: "Confirm delete", other: "Approve" }[a.action] : "";
  const pending = a?.status === "pending";
  return (
    <Sheet open={!!approvalId} onClose={onClose} title={a?.title ?? "Review"} wide>
      {!d ? <Skeleton className="h-[232px]" /> : (
        <div className="space-y-5">
          {a?.summary && <p className="muted">{a.summary}</p>}
          {a?.status === "approved" && a.error && <p className="rounded-2xl p-3 text-[14.5px]" style={{ background: "color-mix(in srgb, var(--warn) 14%, transparent)" }}>{a.error}</p>}
          {a?.risk === "high" && pending && <p className="rounded-2xl p-3 text-[14.5px]" style={{ background: "color-mix(in srgb, var(--warn) 14%, transparent)" }}>This is a large or hard-to-undo action, so Mila always asks first — whatever your autonomy settings say.</p>}

          {d.drafts.length > 0 && cur && draft && (
            <div>
              {d.drafts.length > 1 && <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto sm:flex-wrap sm:overflow-visible">{d.drafts.map((x, i) => <button key={x.id} className="chip shrink-0" style={i === idx ? { background: "var(--accent)", color: "var(--accent-ink)" } : undefined} onClick={() => setIdx(i)}>{recipientNames(x)[0] ?? "Draft"}</button>)}</div>}
              <p className="faint mb-1 text-[13px] font-semibold">TO · {total > 1 && d.drafts.length === 1 ? `${total} recipients (each gets their own copy)` : recipientNames(draft).slice(0, 3).join(", ") + (recipientNames(draft).length > 3 ? ` +${recipientNames(draft).length - 3}` : "")}</p>
              {d.drafts.length === 1 && total > 1 && <p className="faint mb-2 text-[12.5px]">{recipientNames(draft).slice(0, 12).join(", ")}{total > 12 ? `, and ${total - 12} more` : ""}</p>}
              {draft.stale && <p className="mb-2 text-[13.5px]" style={{ color: "var(--warn)" }}>⚠ {draft.stale_reason}. Ask Mila to update it.</p>}
              <label className="lbl">Subject</label><input className="field mb-3" disabled={!pending} value={cur.subject} onChange={(e) => setEdits({ ...edits, [draft.id]: { ...cur, subject: e.target.value } })} />
              <label className="lbl">Message</label><textarea className="field min-h-[220px] leading-relaxed" disabled={!pending} value={cur.body} onChange={(e) => setEdits({ ...edits, [draft.id]: { ...cur, body: e.target.value } })} />
              <p className="faint mt-1 text-[12.5px]">“{"{{first_name}}"}” becomes their first name{total > 1 && d.drafts.length === 1 ? " (or “there” when it goes to several people at once)" : ""}.</p>
            </div>
          )}

          {d.post && (
            <div>
              <div className="no-scrollbar -mx-1 mb-4 flex gap-3 overflow-x-auto px-1">{d.post.slides.map((s, i) => <SlidePreview key={i} slide={s} index={i} total={d.post!.slides.length} />)}</div>
              {d.post.stale && <p className="mb-2 text-[13.5px]" style={{ color: "var(--warn)" }}>⚠ {d.post.stale_reason}. Ask Mila to update it.</p>}
              <label className="lbl">Caption</label><textarea className="field min-h-[160px]" disabled={!pending} value={caption} onChange={(e) => setCaption(e.target.value)} />
              <p className="faint mt-2 text-[13px]">Automatic posting isn't connected yet. After you approve, copy the caption and slides to publish yourself.</p>
            </div>
          )}

          {d.event && <div className="glass p-4" style={{ borderRadius: 20 }}><p className="font-semibold">{d.event.title}</p><p className="muted text-[14.5px]">Now: {fmtDayTime(d.event.start_at, profile.timezone)}</p>{(a?.payload.args as any)?.start_at && <p className="text-[14.5px] font-semibold">New: {fmtDayTime((a!.payload.args as any).start_at, profile.timezone)}</p>}</div>}

          {pending && isEmail && draft && (
            <div className="space-y-2.5 pt-1">
              <div className="flex gap-3"><button className="btn flex-1" disabled={busy} onClick={() => decide("reject")}>Decline</button><button className="btn btn-primary flex-[2]" disabled={busy} onClick={() => openMail("app")}>{busy ? "Opening…" : opened[draft.id] ? "Open again" : "Open in email app"}</button></div>
              <p className="faint text-center text-[12.5px]">Opens your email app with the message ready — you press send. {profile.email.toLowerCase().endsWith("@gmail.com") || profile.email.toLowerCase().endsWith("@googlemail.com") ? <button type="button" className="font-semibold underline" onClick={() => openMail("gmail")}>Use Gmail instead</button> : null}</p>
              {d && d.drafts.length > 1 && <p className="faint text-center text-[12.5px]">{d.drafts.filter((x) => opened[x.id]).length} of {d.drafts.length} opened — pick the next person above.</p>}
            </div>
          )}
          {pending && !isEmail && <div className="flex gap-3 pt-1"><button className="btn flex-1" disabled={busy} onClick={() => decide("reject")}>Decline</button><button className="btn btn-primary flex-[2]" disabled={busy} onClick={() => decide("approve")}>{busy ? "Working…" : action}</button></div>}
        </div>
      )}
    </Sheet>
  );
}
