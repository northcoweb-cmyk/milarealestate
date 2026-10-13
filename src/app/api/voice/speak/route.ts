import { api, bad, readJson } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { ensureCredits, recordUsage } from "@/lib/credits";
import { AiBudgetError, assertAiBudget, noteAiSpend, runInAiScope } from "@/lib/ai/budget";
import { cleanForSpeech, speechCostUsd } from "@/lib/voice";
import { logError } from "@/lib/server/errors";

/**
 * Mila's spoken voice. Text in, audio out. Each spoken reply costs a credit and counts against the person's AI allowance, like any other AI use.
 * If the voice service isn't set up or the allowance is reached, the app falls back to the device's own voice (this route says so with a plain status).
 */
export const POST = api(async ({ profile, req }) => {
  rateLimit(`speak:${profile.id}`, 40, 10 * 60_000);
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: "Mila's voice isn't set up yet.", code: "not_configured" }, { status: 501 });
  const b = await readJson<{ text?: unknown }>(req);
  const text = cleanForSpeech(typeof b.text === "string" ? b.text : "");
  if (!text) throw bad("Nothing to say.");
  await ensureCredits(profile.id, 1); // trial lock and credit balance apply to voice too
  return runInAiScope(profile.id, async () => {
    try { await assertAiBudget({ tier: "fast", inputChars: text.length }); }
    catch (e) { if (e instanceof AiBudgetError) return Response.json({ error: "Voice is paused for now. Replies are still on screen.", code: e.code }, { status: 429 }); throw e; }
    const model = process.env.MILA_TTS_MODEL || "gpt-4o-mini-tts";
    const r = await fetch(`${(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "")}/audio/speech`, {
      method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, voice: process.env.MILA_TTS_VOICE || "shimmer", input: text, response_format: "mp3", ...(model.includes("mini-tts") ? { instructions: "Speak as Mila, a warm, calm, capable assistant for busy real estate agents. Natural pace, friendly, never robotic or rushed." } : {}) }),
      signal: AbortSignal.timeout(25_000),
    }).catch(() => null);
    if (!r || !r.ok) { await logError({ source: "ai", level: "warn", message: `voice failed: ${r?.status ?? "no response"}`, userId: profile.id, email: profile.email }); return Response.json({ error: "Couldn't make the voice just now.", code: "upstream" }, { status: 502 }); }
    const audio = Buffer.from(await r.arrayBuffer());
    const cost = speechCostUsd(text.length);
    noteAiSpend(cost);
    await recordUsage({ userId: profile.id, operation: "voice_speak", creditKey: "voice_speech", provider: "openai", model, tier: "voice", inputUnits: text.length, outputUnits: 0, estCostUsd: cost });
    return new Response(new Uint8Array(audio), { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600", "content-length": String(audio.length) } });
  });
});
