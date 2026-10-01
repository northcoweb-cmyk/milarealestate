import { NextResponse } from "next/server";
import { AuthError, getProfile } from "../auth";
import { buildCtx } from "../agent/engine";
import type { Profile } from "../types";

type Params = Record<string, string>;
export interface ApiArgs<P extends Params> { req: Request; profile: Profile; params: P; url: URL }

/** Wraps a route handler: authenticates, parses params, and turns errors into clean JSON. */
export function api<P extends Params = Params>(fn: (a: ApiArgs<P>) => Promise<unknown>) {
  return async (req: Request, ctx: { params: Promise<P> } = { params: Promise.resolve({} as P) }) => {
    try {
      const profile = await getProfile();
      if (!profile) throw new AuthError();
      const out = await fn({ req, profile, params: await ctx.params, url: new URL(req.url) });
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error("[api]", req.method, req.url, e);
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
