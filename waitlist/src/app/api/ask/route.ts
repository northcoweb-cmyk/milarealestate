import { NextResponse } from "next/server";
import { cleanAnswer, cleanQuestion, dailyCapOk, looksLikeHijack, visitorAllowed } from "@/lib/ask-guard";
import { OFF_TOPIC_REPLY, SUPPORT_EMAIL, SYSTEM_PROMPT } from "@/lib/mila-kb";
import { bumpSiteChat } from "@/lib/sb";

export const maxDuration = 30;
const MAX_TOKENS = 170;
const json = (b: object, status = 200) => NextResponse.json(b, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  if (process.env.ASK_DISABLED === "1") return json({ error: "Ask Mila is taking a break. Please check the FAQ above." }, 503);
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: "Ask Mila isn't switched on yet. Please check the FAQ above." }, 503);

  // Only our own pages may call this (stops other websites using your key from a browser).
  const origin = req.headers.get("origin");
  if (origin) { try { if (new URL(origin).host !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))) return json({ error: "Not allowed." }, 403); } catch { return json({ error: "Not allowed." }, 403); } }

  const body = (await req.json().catch(() => ({}))) as { question?: unknown };
  const q = cleanQuestion(body.question);
  if (!q) return json({ error: "Type a short question (3 to 200 characters)." }, 400);
  if (looksLikeHijack(q)) return json({ answer: OFF_TOPIC_REPLY, offTopic: true });

  const ip = (req.headers.get("x-forwarded-for") ?? "x").split(",")[0].trim();
  if (!visitorAllowed(ip)) return json({ error: "You've asked a lot of questions. Please try again in a few minutes, or email us." }, 429);
  const limit = Number(process.env.ASK_DAILY_LIMIT || 300);
  if (!(await dailyCapOk(limit, bumpSiteChat))) return json({ error: "Ask Mila is very busy today. Please check the FAQ above or email us." }, 429);

  try {
    const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: process.env.ASK_MODEL || "gpt-4o-mini", temperature: 0.2, max_tokens: MAX_TOKENS, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: q }] }),
      signal: AbortSignal.timeout(14000),
    });
    if (!r.ok) { console.error("[ask] model error", r.status); return json({ error: "Ask Mila couldn't answer just now. Please try again, or email us." }, 502); }
    const d = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const text = (d.choices?.[0]?.message?.content ?? "").trim();
    if (!text || /^\W*OFF_TOPIC\b/i.test(text)) return json({ answer: OFF_TOPIC_REPLY, offTopic: true });
    const answer = cleanAnswer(text, SUPPORT_EMAIL);
    if (!answer) return json({ answer: OFF_TOPIC_REPLY, offTopic: true });
    return json({ answer, offTopic: false });
  } catch (e) {
    console.error("[ask]", e instanceof Error ? e.message : e);
    return json({ error: "Ask Mila couldn't answer just now. Please try again, or email us." }, 502);
  }
}
