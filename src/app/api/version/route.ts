import { NextResponse } from "next/server";

/** Which build is live: the git commit and branch Vercel built from. Public, harmless, and the fastest way to confirm a deploy landed. */
export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json({ commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7), branch: process.env.VERCEL_GIT_COMMIT_REF ?? null, env: process.env.VERCEL_ENV ?? "local" });
}
