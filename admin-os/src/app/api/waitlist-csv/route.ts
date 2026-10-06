import { isAuthed } from "@/lib/auth";
import { table } from "@/lib/sb";

export const dynamic = "force-dynamic";
const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`; // quoted, and defused against spreadsheet formula injection

export async function GET() {
  if (!(await isAuthed())) return new Response("Unauthorized", { status: 401 });
  const rows = (await table<{ email: string; name: string | null; source: string | null; created_at: string }>("waitlist", { select: "email,name,source,created_at", order: "created_at.asc" })) ?? [];
  const csv = ["email,name,source,joined", ...rows.map((r) => [r.email, r.name, r.source, r.created_at].map(q).join(","))].join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="mila-waitlist.csv"', "cache-control": "no-store" } });
}
