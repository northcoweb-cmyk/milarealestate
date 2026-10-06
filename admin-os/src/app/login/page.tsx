import { redirect } from "next/navigation";
import { authConfigured, isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await isAuthed()) redirect("/");
  const { e } = await searchParams;
  return (
    <main className="login">
      <form action="/api/login" method="post">
        <div className="brand" style={{ fontSize: 48, textAlign: "center" }}>Mila<small>OS</small></div>
        <p className="lead" style={{ textAlign: "center", marginTop: 0 }}>Admin sign in</p>
        {!authConfigured() && <p className="note warn">Set ADMIN_OS_EMAIL, ADMIN_OS_PASSWORD and ADMIN_OS_SECRET (16+ characters) in the Vercel project settings, then redeploy.</p>}
        <input className="field" name="email" type="email" autoComplete="username" placeholder="Email" required />
        <input className="field" name="password" type="password" autoComplete="current-password" placeholder="Password" required />
        {e && <p className="err" role="alert">{e === "rate" ? "Too many tries. Wait a few minutes." : "That email and password don't match."}</p>}
        <button className="btn primary" type="submit" style={{ minHeight: 48 }}>Sign in</button>
      </form>
    </main>
  );
}
