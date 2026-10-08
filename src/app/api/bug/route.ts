import { api, bad, readJson } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { getStore } from "@/lib/db/store";
import { isTester } from "@/lib/testers";
import { logError } from "@/lib/server/errors";

const CATEGORIES = { wrong_answer: "Wrong answer", looks_bad: "Looks bad", broke: "Something broke", idea: "Idea / change" } as const;
const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

/** Opens a GitHub issue an agent can read and fix. Needs GITHUB_BUG_TOKEN (issues: write on the repo). Failure never blocks the report, which is already saved. */
async function openIssue(title: string, body: string): Promise<number | null> {
  const token = process.env.GITHUB_BUG_TOKEN, repo = process.env.GITHUB_BUG_REPO || "northcoweb-cmyk/milarealestate";
  if (!token) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/issues`, { method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "content-type": "application/json", "User-Agent": "mila-bug-channel" }, body: JSON.stringify({ title, body, labels: ["bug", "tester-report"] }), signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return ((await r.json()) as { number?: number }).number ?? null;
  } catch { return null; }
}

/** Anyone signed in can report a bug (Settings > Report a bug); test agents also get a flag on every screen. It saves the report with what was on screen and in the chat, and opens an issue. */
export const POST = api(async ({ req, profile }) => {
  const tester = isTester(profile.email);
  rateLimit(`bug:${profile.id}`, tester ? 60 : 10, 60 * 60_000); // anyone signed in can report; testers get a higher cap
  const b = await readJson<{ note?: unknown; category?: unknown; page?: unknown; snippet?: unknown; targetId?: unknown; device?: unknown }>(req);
  const note = clip(b.note, 2000);
  if (!note) throw bad("Tell us what's wrong in a few words.");
  const category = (Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]).find((k) => k === b.category) ?? "wrong_answer";
  const store = getStore();
  // what was said just before: the last messages of the latest conversation, so the fixer can reproduce it
  const msgs = (await store.list("messages", profile.id)).sort((a, c) => a.created_at.localeCompare(c.created_at));
  const convo = msgs.length ? msgs.filter((m) => m.conversation_id === msgs[msgs.length - 1].conversation_id).slice(-8) : [];
  const transcript = convo.map((m) => ({ role: m.role, text: (m.content ?? "").slice(0, 700), blocks: (m.blocks ?? []).map((x) => x.type) }));
  const context = { page: clip(b.page, 160), device: clip(b.device, 200), flagged_message: clip(b.snippet, 700), flagged_message_id: clip(b.targetId, 80), transcript, reported_at: new Date().toISOString() };
  const row = await store.insert("feedback", profile.id, { kind: "bug", target: "bug", target_id: clip(b.targetId, 80), note, snippet: clip(b.snippet, 400), page: clip(b.page, 120), category, context, status: "open", github_issue: null } as never);
  const title = `[${CATEGORIES[category]}] ${note.replace(/\s+/g, " ").slice(0, 70)}`;
  const body = [`**Reported by a test agent** (${profile.full_name || "tester"}) from \`${context.page ?? "unknown page"}\`.`, "", `**What they said**\n${note}`, context.flagged_message ? `\n**Message flagged**\n> ${context.flagged_message.replace(/\n/g, "\n> ")}` : "", "\n**Recent chat**", ...transcript.map((m) => `- ${m.role === "user" ? "👤" : "🤖"} ${m.text.replace(/\n/g, " ")}${m.blocks.length ? ` _[${m.blocks.join(", ")}]_` : ""}`), `\n_Device: ${context.device ?? "unknown"} · feedback id ${row.id}_`].join("\n");
  const issue = await openIssue(title, body);
  if (issue) await store.update("feedback", profile.id, row.id, { github_issue: issue } as never);
  else if (process.env.GITHUB_BUG_TOKEN) await logError({ source: "api", message: "Bug report saved but the GitHub issue could not be created", route: "POST /api/bug", userId: profile.id, email: profile.email });
  return { ok: true, id: row.id, issue };
});
