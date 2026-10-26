import Link from "next/link";
export default function NotFound() {
  return <div className="shell"><div className="card" style={{ marginTop: 40, display: "grid", gap: 12, maxWidth: 520 }}><h2>Not found</h2><p className="lead">That page or record doesn&apos;t exist (it may have been deleted).</p><Link className="btn primary" href="/">Back to overview</Link></div></div>;
}
