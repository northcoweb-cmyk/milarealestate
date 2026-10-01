import { getProfile } from "@/lib/auth";
import { handleTurn } from "@/lib/agent/engine";

export const maxDuration = 120;

/** Streams newline-delimited JSON: {"step": "..."} while Mila works, then {"done": {...}}. */
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return Response.json({ error: "Please sign in." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { message?: string; action?: any; attachmentIds?: string[]; conversationId?: string };
  if (!body.message?.trim() && !body.action && !body.attachmentIds?.length) return Response.json({ error: "Say something first." }, { status: 400 });
  if ((body.message?.length ?? 0) > 6000) return Response.json({ error: "That message is too long." }, { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const out = await handleTurn(profile, { ...body, onStep: (step) => send({ step }) });
        send({ done: out });
      } catch (e) {
        console.error("[agent]", e);
        send({ error: "Something went wrong. Please try again." });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
