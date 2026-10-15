"use client";

import Link from "next/link";
import { Mail, MessageSquare } from "lucide-react";
import { Avatar, Empty, Skeleton } from "@/components/ui";
import { useApi } from "@/components/use-api";
import { ago } from "@/components/page";

interface Msg { id: string; channel: "email" | "text"; contactId: string | null; name: string; subject: string; snippet: string; status: "sent" | "handed_off" | "drafted" | "received"; at: string }
interface FollowUp { id: string; name: string; phone: string | null; email: string | null; days: number; why: string }
interface Hub { messages: Msg[]; followUps: FollowUp[]; retentionDays: number }

const STATUS: Record<Msg["status"], { label: string; color: string }> = { sent: { label: "Sent", color: "var(--ok)" }, handed_off: { label: "Opened in your mail app", color: "var(--accent)" }, drafted: { label: "Drafted", color: "var(--ink-soft)" }, received: { label: "They replied", color: "var(--accent)" } };

/** One place to see every email and text Mila has written for the last month, and who is due a follow-up. */
export function MessagesView() {
  const { data, loading } = useApi<Hub>("/api/communications");
  if (loading && !data) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>;
  const rows = data?.messages ?? [];
  if (!rows.length) return <Empty title="No messages yet" body="Emails and texts Mila writes for you show up here, with who they went to and whether they were sent. Try: “Email Dana that the showing is confirmed.”" />;
  return (
    <>
      <ul className="glass divide-y overflow-hidden" style={{ borderColor: "var(--line)", borderRadius: 24 }}>{rows.map((m) => (
        <li key={m.id}>
          <Link href={m.contactId ? `/contacts/${m.contactId}` : "/contacts"} className="flex items-start gap-3.5 px-4 py-3.5">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}>{m.channel === "email" ? <Mail size={19} aria-hidden /> : <MessageSquare size={19} aria-hidden />}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3"><span className="truncate font-semibold">{m.name}</span><span className="faint shrink-0 text-[12.5px]">{ago(m.at)}</span></span>
              <span className="block truncate text-[14.5px]">{m.subject}</span>
              {m.snippet && <span className="muted block truncate text-[13.5px]">{m.snippet}</span>}
              <span className="mt-1 inline-block text-[12px] font-bold" style={{ color: STATUS[m.status].color }}>{STATUS[m.status].label}</span>
            </span>
          </Link>
        </li>))}</ul>
      <p className="faint mt-3 px-2 text-[12.5px]">Messages are kept for {data?.retentionDays ?? 30} days, then cleared automatically. Your contacts and notes are never cleared.</p>
    </>
  );
}

export function FollowUpsView() {
  const { data, loading } = useApi<Hub>("/api/communications");
  if (loading && !data) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>;
  const rows = data?.followUps ?? [];
  if (!rows.length) return <Empty title="You're caught up" body="Nobody is overdue for a follow-up. When someone goes quiet for too long, they'll show up here." />;
  return (
    <ul className="space-y-3">{rows.map((f) => (
      <li key={f.id} className="glass flex items-center gap-3.5 p-4" style={{ borderRadius: 24 }}>
        <Avatar name={f.name} size={44} />
        <div className="min-w-0 flex-1"><Link href={`/contacts/${f.id}`} className="block truncate font-semibold">{f.name}</Link><p className="muted truncate text-[13.5px]">{f.why}</p></div>
        <div className="flex shrink-0 gap-2">
          {f.email && <Link className="btn btn-sm" href={`/?ask=${encodeURIComponent(`Draft a follow-up email to ${f.name}`)}`}>Email</Link>}
          {f.phone && <Link className="btn btn-sm" href={`/?ask=${encodeURIComponent(`Draft a follow-up text to ${f.name}`)}`}>Text</Link>}
        </div>
      </li>))}</ul>
  );
}
