import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { Missing, Pill } from "@/components/ui";
import { TicketActions } from "@/components/ticket-actions";
import { getWho, isAuthed } from "@/lib/auth";
import { ago, fmt } from "@/lib/data";
import { NoKeys } from "@/lib/page";
import { configured, table } from "@/lib/sb";
import { SUPPORT_EMAIL } from "@/lib/mail";

export const dynamic = "force-dynamic";

type Row = { id: string; created_at: string; note: string | null; status: string | null; context: { ticket_no?: string; name?: string; email?: string; topic?: string; topic_label?: string; subject?: string; plan?: string | null; status?: string | null; credits_used_this_period?: number | null; attachments?: { id: string; name: string }[]; thread?: { dir: "in" | "out"; at: string; text: string }[] } | null };

export default async function Support() {
  if (!(await isAuthed())) redirect("/login");
  if (!configured()) return <Shell title="Support"><NoKeys /></Shell>;
  const who = await getWho();
  const rows = await table<Row>("feedback", { select: "id,created_at,note,status,context,category", filter: "category=eq.support_ticket", order: "created_at.desc", max: 300 });
  const app = (process.env.NEXT_PUBLIC_APP_URL || "https://app.milarealestate.app").replace(/\/$/, "");
  const now = Date.now();
  const open = (rows ?? []).filter((r) => (r.status ?? "open") !== "resolved"), done = (rows ?? []).filter((r) => r.status === "resolved");
  const card = (r: Row) => {
    const c = r.context ?? {};
    const st = r.status ?? "open";
    const hours = (now - new Date(r.created_at).getTime()) / 3_600_000;
    const last = c.thread?.[c.thread.length - 1];
    const waiting = st === "open" || last?.dir === "in";
    return (
      <details key={r.id} className="card ticket" open={waiting && st !== "resolved" && open.length <= 3}>
        <summary>
          <span className="t-main"><b>{c.ticket_no ?? r.id.slice(0, 6)}</b> <span className="mute">{c.topic_label}</span> · {c.subject}</span>
          <span className="t-meta"><span title={fmt(r.created_at)}>{ago(r.created_at, now)}</span> <Pill tone={st === "resolved" ? "ok" : waiting ? (hours > 48 ? "bad" : "warn") : "mute"}>{st === "resolved" ? "resolved" : waiting ? (hours > 48 ? "overdue" : "needs reply") : "replied"}</Pill></span>
        </summary>
        <p className="mute">{c.name} · <a href={`mailto:${c.email}`}>{c.email}</a> · plan {c.plan ?? "n/a"} ({c.status ?? "n/a"}) · {c.credits_used_this_period ?? "n/a"} credits used</p>
        <div className="thread">
          <div className="msg in"><span className="who">{c.name ?? "Customer"} · {fmt(r.created_at)}</span><p>{r.note}</p></div>
          {c.attachments?.length ? <p className="files">Files: {c.attachments.map((f) => <a key={f.id} href={`${app}/api/admin/support-file/${f.id}`} target="_blank" rel="noreferrer">{f.name}</a>)}</p> : null}
          {(c.thread ?? []).map((m, i) => <div key={i} className={`msg ${m.dir}`}><span className="who">{m.dir === "out" ? "You" : c.name ?? "Customer"} · {fmt(m.at)}</span><p>{m.text}</p></div>)}
        </div>
        {c.topic === "data_copy" && <p className="note" style={{ margin: "10px 0" }}><b>Copy of their data.</b> <a className="btn primary" href={`/api/user-export?id=${r.id}`}>Download all their data (file)</a> Then reply to them with it, or tell them it is ready.</p>}
        <TicketActions id={r.id} status={st} email={c.email} canReply={who === "ryan"} />
      </details>
    );
  };
  return (
    <Shell title="Support" lead={`Tickets from inside Mila. Replies go out from ${SUPPORT_EMAIL()}; promise: 48 to 72 hours.`}>
      <Missing tables={rows === null ? ["feedback"] : []} />
      {rows && <>
        <div className="grid g4" style={{ marginBottom: 16 }}>
          <div className="card stat"><p className="eyebrow">Need a reply</p><p className="num">{open.filter((r) => (r.status ?? "open") === "open" || r.context?.thread?.at(-1)?.dir === "in").length}</p></div>
          <div className="card stat"><p className="eyebrow">Open</p><p className="num">{open.length}</p></div>
          <div className="card stat"><p className="eyebrow">Resolved</p><p className="num">{done.length}</p></div>
        </div>
        {!rows.length && <p className="mute">No tickets yet.</p>}
        <div className="stack">{open.map(card)}</div>
        {done.length > 0 && <details className="sec"><summary className="mute">Resolved ({done.length})</summary><div className="stack" style={{ marginTop: 12 }}>{done.map(card)}</div></details>}
      </>}
    </Shell>
  );
}
