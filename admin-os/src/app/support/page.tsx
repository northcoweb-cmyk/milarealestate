import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { Missing, Pill, Section } from "@/components/ui";
import { isAuthed } from "@/lib/auth";
import { ago, fmt } from "@/lib/data";
import { NoKeys } from "@/lib/page";
import { configured, table } from "@/lib/sb";

export const dynamic = "force-dynamic";

type Row = { id: string; created_at: string; user_id: string; note: string | null; status: string | null; context: { ticket_no?: string; name?: string; email?: string; topic_label?: string; subject?: string; plan?: string | null; status?: string | null; credits_used_this_period?: number | null; attachments?: { id: string; name: string }[] } | null };

export default async function Support() {
  if (!(await isAuthed())) redirect("/login");
  if (!configured()) return <Shell title="Support"><NoKeys /></Shell>;
  const rows = await table<Row>("feedback", { select: "id,created_at,user_id,note,status,context,category", filter: "category=eq.support_ticket", order: "created_at.desc", max: 300 });
  const app = (process.env.NEXT_PUBLIC_APP_URL || "https://app.milarealestate.app").replace(/\/$/, "");
  const now = Date.now();
  return (
    <Shell title="Support" lead="Tickets people send from inside Mila. Reply by email within 48 to 72 hours, as promised in the app.">
      <Missing tables={rows === null ? ["feedback"] : []} />
      {rows && (
        <Section title={`Tickets (${rows.length})`}>
          {!rows.length && <p className="mute">No tickets yet.</p>}
          {rows.map((r) => {
            const c = r.context ?? {};
            const hours = (now - new Date(r.created_at).getTime()) / 3_600_000;
            return (
              <div key={r.id} className="card" style={{ marginBottom: 12, padding: 14 }}>
                <p><b>{c.ticket_no ?? r.id.slice(0, 6)}</b> · {c.topic_label ?? "Support"} · <span title={fmt(r.created_at)}>{ago(r.created_at, now)}</span> <Pill tone={(r.status ?? "open") === "open" ? (hours > 48 ? "bad" : "warn") : "ok"}>{r.status ?? "open"}{(r.status ?? "open") === "open" && hours > 48 ? " · past 48h" : ""}</Pill></p>
                <p><b>{c.subject}</b></p>
                <p className="mute">{c.name} · reply to <a href={`mailto:${c.email}`}>{c.email}</a> · plan {c.plan ?? "n/a"} ({c.status ?? "n/a"}) · credits used {c.credits_used_this_period ?? "n/a"}</p>
                <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{r.note}</p>
                {!!c.attachments?.length && <p style={{ marginTop: 8 }}>Files: {c.attachments.map((f) => <a key={f.id} href={`${app}/api/admin/support-file/${f.id}`} target="_blank" rel="noreferrer" style={{ marginRight: 10 }}>{f.name}</a>)}</p>}
              </div>
            );
          })}
        </Section>
      )}
    </Shell>
  );
}
