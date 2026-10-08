import { NextResponse, type NextRequest } from "next/server";
import { parseWho, WHO } from "@/lib/auth";

// Sarah shares the owner's login. After sign-in she picks "Sarah" and can only reach the social workspace; everything else sends her back there.
const SARAH_OK = [/^\/social(\/|$)/, /^\/api\/items(\/|$)/, /^\/who$/, /^\/api\/who$/, /^\/api\/logout$/, /^\/login$/];
const OPEN = [/^\/login$/, /^\/api\/login$/, /^\/who$/, /^\/api\/who$/, /^\/api\/logout$/];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const who = parseWho(req.cookies.get(WHO)?.value);
  if (who === "sarah" && !SARAH_OK.some((r) => r.test(pathname))) return NextResponse.redirect(new URL("/social", req.url));
  if (!who && !OPEN.some((r) => r.test(pathname)) && req.cookies.get("mila_admin_os")) return NextResponse.redirect(new URL("/who", req.url)); // signed in but hasn't picked a profile yet
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js)$).*)"] };
