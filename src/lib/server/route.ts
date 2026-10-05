import { NextResponse } from "next/server";
import { AuthError, getProfile } from "../auth";
import { buildCtx } from "../agent/engine";
import type { Profile } from "../types";
import { runInAiScope } from "../ai/budget";
import { errMessage, errStack, logError } from "./errors";

type Params = Record<string, string>;
export interface ApiArgs<P extends Params> { req: Request; profile: Profile; params: P; url: URL }

/** Wraps a route handler: authenticates, parses params, and turns errors into clean JSON. */
export function api<P extends Params = Params>(fn: (a: ApiArgs<P>) => Promise<unknown>) {
  return async (req: Request, ctx: { params: Promise<P> } = { params: Promise.resolve({} as P) }) => {
    try {
      const profile = await getProfile();
      if (!profile) throw new AuthError();
      const params = await ctx.params;
      const out = await runInAiScope(profile.id, () => fn({ req, profile, params, url: new URL(req.url) })); // AI spend inside this request is metered to this person
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error("[api]", req.method, req.url, e);
      const p = await getProfile().catch(() => null);
      await logError({ source: "api", message: errMessage(e), stack: errStack(e), route: `${req.method} ${new URL(req.url).pathname}`, userId: p?.id, email: p?.email });
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export const notFound = (what = "That") => new HttpError(404, `${what} wasn't found.`);
export const bad = (msg: string) => new HttpError(400, msg);

export async function ctxFor(profile: Profile) { return buildCtx(profile); }

export async function readJson<T = Record<string, any>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { throw bad("Invalid request."); }
}
