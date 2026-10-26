"use client";
/** If one page's data fails, the rest of Mila OS keeps working: a clear message and a retry instead of a blank screen. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="shell"><div className="card" style={{ marginTop: 40, display: "grid", gap: 12, maxWidth: 520 }}>
      <h2>Something didn&apos;t load</h2>
      <p className="lead">This page hit a problem reading its data. Nothing was changed. Try again, or go back to the overview.</p>
      {error.digest && <p className="mute" style={{ fontSize: 12 }}>Reference {error.digest}</p>}
      <div style={{ display: "flex", gap: 10 }}><button className="btn primary" onClick={reset}>Try again</button><a className="btn" href="/">Overview</a></div>
    </div></div>
  );
}
