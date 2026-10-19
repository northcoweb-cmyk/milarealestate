import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, guide } from "@/lib/guides";
import { SITE } from "@/lib/site";

export const dynamicParams = false;
export const generateStaticParams = () => GUIDES.map((g) => ({ slug: g.slug }));
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = guide((await params).slug);
  if (!g) return {};
  return { title: g.title, description: g.description, alternates: { canonical: `${SITE}/guides/${g.slug}` }, openGraph: { title: g.title, description: g.description, type: "article", url: `${SITE}/guides/${g.slug}` } };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = guide((await params).slug);
  if (!g) notFound();
  const ld = { "@context": "https://schema.org", "@type": "Article", headline: g.title, description: g.description, dateModified: g.updated, datePublished: g.updated, author: { "@type": "Organization", name: "Mila" }, publisher: { "@type": "Organization", name: "Mila", url: SITE }, mainEntityOfPage: `${SITE}/guides/${g.slug}` };
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <Link href="/" className="display text-4xl">Mila</Link>
      <p className="mt-8 text-[14px] text-muted-foreground"><Link href="/guides" className="underline">Guides</Link></p>
      <h1 className="display mt-2 text-5xl">{g.title}</h1>
      <p className="mt-2 text-[14px] text-muted-foreground">Updated {g.updated}</p>
      <p className="mt-6 text-[17px] leading-relaxed">{g.intro}</p>
      <div className="mt-6 space-y-5 text-[16px] leading-relaxed text-foreground/85 [&_h2]:mt-8 [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {g.sections.map((s) => <section key={s.h}><h2>{s.h}</h2>{s.p?.map((t) => <p key={t} className="mt-2">{t}</p>)}{s.ul && <ul className="mt-2">{s.ul.map((t) => <li key={t}>{t}</li>)}</ul>}</section>)}
      </div>
      <p className="mt-12 text-[16px]"><Link href="/" className="font-semibold underline">Join the Mila waitlist: 7-day free trial at launch, October 23.</Link></p>
    </main>
  );
}
