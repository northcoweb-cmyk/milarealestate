import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { oauthStateSig } from "@/lib/integrations/oauth-state";
import { cookies } from "next/headers";
import { getUserId } from "@/lib/auth";
import { msExchangeCode, msSaveConnection } from "@/lib/integrations/microsoft";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/settings/connections?${q}`, req.url));
  const uid = await getUserId();
  if (!uid) return NextResponse.redirect(new URL("/welcome", req.url));
  if (url.searchParams.get("error")) return back("error=denied");
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  const jar = await cookies();
  const cookie = jar.get("mila_oauth_ms")?.value;
  jar.delete("mila_oauth_ms");
  if (!code || !state || !cookie) return back("error=state");
  const [nonce, sig] = cookie.split(".");
  const exp = oauthStateSig(nonce ?? "", uid);
  if (!exp || !sig || nonce !== state || sig.length !== exp.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return back("error=state");
  try {
    const { tokens, scopes } = await msExchangeCode(code);
    await msSaveConnection(uid, tokens, scopes);
    return back("connected=outlook");
  } catch {
    return back("error=exchange");
  }
}
