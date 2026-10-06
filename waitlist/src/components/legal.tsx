import Link from "next/link";
export function Legal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <Link href="/" className="display text-4xl">Mila</Link>
      <h1 className="display mt-10 text-5xl">{title}</h1>
      <p className="mt-2 text-[14px] text-muted-foreground">Last updated October 2026</p>
      <div className="mt-8 space-y-5 text-[16px] leading-relaxed text-foreground/85 [&_h2]:mt-8 [&_h2]:text-[20px] [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">{children}</div>
      <p className="mt-12 text-[14px]"><Link href="/" className="underline">Back to Mila</Link></p>
    </main>
  );
}
