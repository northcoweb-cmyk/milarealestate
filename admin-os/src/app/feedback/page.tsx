import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { Missing, Pill, Section } from "@/components/ui";
import { isAuthed } from "@/lib/auth";
import { ago, fmt } from "@/lib/data";
import { NoKeys } from "@/lib/page";
import { configured, table } from "@/lib/sb";

export const dynamic = "force-dynamic";

type Fb = { id: string; created_at: string; user_id: string; kind: "useful" | "missing" | "wrong"; target: string; note: string | null; snippet: string | null; page: string | null };
type Profile = { id: string; email: string | null; full_name: string | null };

export default async function Feedback() {
  if (!(await isAuthed())) redirect("/login");
  if (!configured()) return <Shell title="Feedback"><NoKeys /></Shell>;
  const rows = await table<Fb>("feedback", { select: "id,created_at,user_id,kind,target,note,snippet,page", order: "created_at.desc", max: 500 });
  const people = rows?.length ? await table<Profile>("profiles", { select: "id,email,full_name", filter: `id=in.(${[...new Set(rows.map((r) => r.user_id))].join(",")})` }) : [];
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email || p.id.slice(0, 8)]));
  const n = (k: Fb["kind"]) => rows?.filter((r) => r.kind === k).length ?? 0;
  const now = Date.now();
  return (
    <Shell title="Feedback" lead="One-tap ratings from inside the app. Read the wrong and missing ones first.">
      <Missing tables={rows === null ? ["feedback"] : []} />
      {rows && (
        <>
          <p className="lead" style={{ marginTop: 8 }}>{n("useful")} useful · {n("missing")} missing something · {n("wrong")} wrong</p>
          <Section title={`Latest (${rows.length})`}>
            <div className="tw"><table>
              <thead><tr><th>When</th><th>Who</th><th>Rating</th><th>What they said</th><th>What Mila said</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td title={fmt(r.created_at)}>{ago(r.created_at, now)}</td><td>{who.get(r.user_id) ?? r.user_id.slice(0, 8)}</td>
                  <td><Pill tone={r.kind === "useful" ? "ok" : r.kind === "wrong" ? "bad" : "warn"}>{r.kind}</Pill></td>
                  <td style={{ maxWidth: 320 }}>{r.note ?? <span className="mute">no note</span>}</td>
                  <td style={{ maxWidth: 360 }} className="mute">{r.snippet ?? ""}{r.page ? ` (${r.page})` : ""}</td>
                </tr>
              ))}{!rows.length && <tr><td colSpan={5} className="mute">Nothing yet. Ratings show up here once people use the app.</td></tr>}</tbody>
            </table></div>
          </Section>
        </>
      )}
    </Shell>
  );
}
