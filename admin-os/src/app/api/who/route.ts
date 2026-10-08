import { NextResponse } from "next/server";
import { isAuthed, setWho } from "@/lib/auth";

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.redirect(new URL("/login", req.url), 303);
  const who = String((await req.formData()).get("who") ?? "");
  if (who !== "ryan" && who !== "sarah") return NextResponse.redirect(new URL("/who", req.url), 303);
  await setWho(who);
  return NextResponse.redirect(new URL(who === "sarah" ? "/social" : "/", req.url), 303);
}
