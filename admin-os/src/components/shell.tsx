import { Nav } from "./nav";

const days = () => Math.ceil((new Date(`${process.env.LAUNCH_DATE || "2026-10-20"}T00:00:00-04:00`).getTime() - Date.now()) / 86_400_000);

export function Shell({ title, lead, right, children }: { title: string; lead?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const d = days();
  return (
    <div className="shell">
      <header className="top">
        <div className="brand">Mila<small>OS</small></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="countdown">{d > 0 ? <><b>{d}</b> days to launch</> : d === 0 ? <b>Launch day</b> : <>Launched {-d}d ago</>}</span>
          <form action="/api/logout" method="post"><button className="btn" type="submit">Sign out</button></form>
        </div>
      </header>
      <Nav />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div><h1>{title}</h1>{lead && <p className="lead">{lead}</p>}</div>{right}
      </div>
      {children}
    </div>
  );
}
