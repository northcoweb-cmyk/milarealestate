import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Who() {
  if (!(await isAuthed())) redirect("/login");
  return (
    <main className="login">
      <form action="/api/who" method="post">
        <div className="brand" style={{ fontSize: 48, textAlign: "center" }}>Mila<small>OS</small></div>
        <p className="lead" style={{ textAlign: "center", marginTop: 0 }}>Who&apos;s working?</p>
        <button className="btn primary" name="who" value="ryan" type="submit" style={{ minHeight: 64, fontSize: 18 }}>Ryan<br /><small style={{ opacity: .7, fontWeight: 400 }}>Product, code, launch, videos</small></button>
        <button className="btn" name="who" value="sarah" type="submit" style={{ minHeight: 64, fontSize: 18 }}>Sarah<br /><small style={{ opacity: .7, fontWeight: 400 }}>Social posts, outreach, notes</small></button>
      </form>
    </main>
  );
}
