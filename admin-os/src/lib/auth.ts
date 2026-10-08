import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "mila_admin_os";
const secret = () => process.env.ADMIN_OS_SECRET ?? "";
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("hex");

export const authConfigured = () => !!process.env.ADMIN_OS_EMAIL && !!process.env.ADMIN_OS_PASSWORD && secret().length >= 16;

export function same(a: string, b: string) {
  const x = Buffer.from(createHmac("sha256", "cmp").update(a).digest("hex")), y = Buffer.from(createHmac("sha256", "cmp").update(b).digest("hex"));
  return timingSafeEqual(x, y);
}
export function checkLogin(email: string, password: string) {
  if (!authConfigured()) return false;
  const e = same(email.trim().toLowerCase(), (process.env.ADMIN_OS_EMAIL ?? "").trim().toLowerCase());
  const p = same(password, process.env.ADMIN_OS_PASSWORD ?? "");
  return e && p;
}
export async function startSession() {
  const exp = String(Date.now() + 7 * 86_400_000);
  (await cookies()).set(COOKIE, `${exp}.${sign(exp)}`, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 86_400 });
}
export async function endSession() { const j = await cookies(); j.delete(COOKIE); j.delete(WHO); }

// Who is using this shared login: Ryan (everything) or Sarah (social and notes only). Chosen after sign-in, signed so it can't be edited.
export const WHO = "mila_os_who";
export type Who = "ryan" | "sarah";
export const parseWho = (v: string | undefined): Who | null => {
  if (!v) return null;
  const i = v.indexOf("."); if (i < 0) return null;
  const w = v.slice(0, i), sig = v.slice(i + 1);
  return (w === "ryan" || w === "sarah") && same(sig, sign(`who:${w}`)) ? w : null;
};
export async function setWho(w: Who) { (await cookies()).set(WHO, `${w}.${sign(`who:${w}`)}`, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 86_400 }); }
export async function getWho(): Promise<Who | null> { return parseWho((await cookies()).get(WHO)?.value); }
export async function isAuthed() {
  if (!authConfigured()) return false;
  const v = (await cookies()).get(COOKIE)?.value ?? "";
  const i = v.indexOf(".");
  if (i < 0) return false;
  const exp = v.slice(0, i), sig = v.slice(i + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return same(sig, sign(exp));
}
export async function requireAdmin() { if (!(await isAuthed())) redirect("/login"); }
