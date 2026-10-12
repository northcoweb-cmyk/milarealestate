import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { table } from "@/lib/sb";

type Row = { id: string; created_at: string; user_id: string; kind: string; note: string | null; snippet: string | null; page: string | null; category: string | null; status: string | null; context: Record<string, any> | null };

/**
 * One markdown file with every report from a day (default: today, US Eastern), written so it can be pasted straight into a Claude Code session:
 * what the person said, what Mila said, what they expected, the conversation (only when they allowed it), device and version.
 */
export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const u = new URL(req.url);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get("day") ?? "") ? u.searchParams.get("day")! : new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const from = new Date(`${day}T00:00:00-04:00`).toISOString(), to = new Date(new Date(from).getTime() + 86_400_000).toISOString();
  const rows = await table<Row>("feedback", { select: "id,created_at,user_id,kind,note,snippet,page,category,status,context", filter: `created_at=gte.${from}&created_at=lt.${to}`, order: "created_at.asc", max: 500 });
  if (rows === null) return NextResponse.json({ error: "Couldn't read the feedback table." }, { status: 502 });
  const people = rows.length ? await table<{ id: string; email: string | null; full_name: string | null }>("profiles", { select: "id,email,full_name", filter: `id=in.(${[...new Set(rows.map((r) => r.user_id))].join(",")})` }) : [];
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email || p.id.slice(0, 8)]));
  const bad = rows.filter((r) => r.kind !== "useful");
  const out: string[] = [
    `# Mila reports for ${day}`, "",
    `${bad.length} to review (${rows.length - bad.length} "useful" ratings left out).`, "",
    "## What to do with this", "For each report below: reproduce it with tests/qa/harness.mts (or the question bank in tests/eval/question-bank.mts), add a failing regression test first, then fix the root cause, run the full checks, and ship all fixes in one push. Reports marked 'no transcript' need a guess from the flagged message; say so rather than inventing the missing context.", "",
  ];
  bad.forEach((r, i) => {
    const c = r.context ?? {};
    out.push(`## ${i + 1}. ${r.kind}${r.category ? ` / ${r.category}` : ""} (${new Date(r.created_at).toISOString()}, ${who.get(r.user_id) ?? r.user_id.slice(0, 8)})`);
    out.push(`- Page: ${r.page ?? c.page ?? "unknown"}  Device: ${c.device ?? "unknown"}  App version: ${c.app_version ?? "unknown"}  Status: ${r.status ?? "open"}`);
    out.push(`- What the person said: ${r.note ?? "(no note)"}`);
    if (c.expected) out.push(`- What they expected: ${c.expected}`);
    if (c.actual) out.push(`- What actually happened: ${c.actual}`);
    out.push(`- Mila's flagged message: ${c.flagged_message ?? r.snippet ?? "(none saved)"}`);
    if (c.classification) out.push(`- Auto-classification: ${JSON.stringify(c.classification)}`);
    if (c.request_ref) out.push(`- Trace: ${JSON.stringify(c.request_ref)}`);
    if (Array.isArray(c.transcript) && c.transcript.length) { out.push("- Conversation (personal details removed):"); for (const m of c.transcript as { role: string; text: string }[]) out.push(`  - ${m.role === "mila" ? "Mila" : "Agent"}: ${String(m.text).replace(/\n+/g, " ")}`); }
    else out.push("- Conversation: no transcript (the person did not allow it).");
    out.push("");
  });
  if (!bad.length) out.push("Nothing to review for this day.");
  return new NextResponse(out.join("\n"), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store", "content-disposition": `inline; filename="mila-reports-${day}.md"` } });
}
