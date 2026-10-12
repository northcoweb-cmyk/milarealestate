import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/guides";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Real estate agent guides", description: "Practical checklists for real estate agents: open houses, listing launches, daily workflow, and using AI safely.", alternates: { canonical: `${SITE}/guides` } };

export default function Guides() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <Link href="/" className="display text-4xl">Mila</Link>
      <h1 className="display mt-10 text-5xl">Guides for real estate agents</h1>
      <p className="mt-3 text-[16px] text-muted-foreground">Practical checklists from the team building Mila, the AI operations manager for real estate.</p>
      <ul className="mt-8 space-y-6">
        {GUIDES.map((g) => <li key={g.slug}><Link href={`/guides/${g.slug}`} className="text-[20px] font-semibold underline">{g.title}</Link><p className="mt-1 text-[15.5px] text-muted-foreground">{g.description}</p></li>)}
      </ul>
      <p className="mt-12 text-[14px]"><Link href="/" className="underline">Join the Mila waitlist</Link></p>
    </main>
  );
}
