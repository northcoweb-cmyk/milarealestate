import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { oauthStateSig } from "@/lib/integrations/oauth-state";
import { cookies } from "next/headers";
import { getUserId } from "@/lib/auth";
import { GOOGLE_SCOPES, exchangeCode, saveConnection, type GoogleService } from "@/lib/integrations/google";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromOnboarding = (await cookies()).get("mila_oauth_next")?.value === "onboarding";
  const back = (q: string) => NextResponse.redirect(new URL(`${fromOnboarding ? "/onboarding" : "/settings/connections"}?${q}`, req.url));
  const uid = await getUserId();
  if (!uid) return NextResponse.redirect(new URL("/welcome", req.url));
  if (url.searchParams.get("error")) return back("error=denied");
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  const jar = await cookies();
  const cookie = jar.get("mila_oauth")?.value;
  jar.delete("mila_oauth");
  const requested = (jar.get("mila_oauth_svc")?.value ?? "").split(",").filter((x): x is GoogleService => x in GOOGLE_SCOPES && x !== "base");
  jar.delete("mila_oauth_svc"); jar.delete("mila_oauth_next");
  if (!code || !state || !cookie) return back("error=state");
  const [nonce, sig] = cookie.split(".");
  const exp = oauthStateSig(nonce ?? "", uid);
  if (!exp || !sig || nonce !== state || sig.length !== exp.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return back("error=state");
  try {
    const { tokens, scopes } = await exchangeCode(code);
    await saveConnection(uid, tokens, scopes, requested.length ? requested : undefined);
    return back("connected=google");
  } catch {
    return back("error=exchange");
  }
}
