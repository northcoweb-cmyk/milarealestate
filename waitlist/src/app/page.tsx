import Link from "next/link";
import { CalendarDays, FileCheck2, Mail, Megaphone, Mic, NotebookPen, ClipboardList, SunMoon, Users } from "lucide-react";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import PhoneMockupBasic from "@/components/ui/phone-mockups-1";
import FlipClock from "@/components/ui/flip-clock";
import { LogoCloud } from "@/components/ui/logo-cloud-2";
import { WaitlistForm } from "@/components/waitlist-form";
import { Clouds } from "@/components/clouds";
import { Reveal } from "@/components/reveal";
import { SiteNav } from "@/components/site-nav";
import { ScrollToJoin } from "@/components/scroll-to-join";
import { TryMila } from "@/components/try-mila";
import { Faq } from "@/components/faq";

const LAUNCH_AT = process.env.NEXT_PUBLIC_LAUNCH_AT || "2026-10-20T09:00:00-04:00";

const FEATURES = [
  { icon: ClipboardList, title: "Get me ready to list", body: "Photos, a drafted description, and a clear list of what's still missing, built from just an address." },
  { icon: Megaphone, title: "Posts that write themselves", body: "3-slide Instagram carousels with the full address, hashtags and your signature. Edit, then save straight to your photos." },
  { icon: Mail, title: "Emails and texts, drafted", body: "Written in your voice and opened in your own mail or messages app. You tap send." },
  { icon: CalendarDays, title: "Open houses and showings", body: "On your calendar with a photo card, directions, a sign-in sheet, and one tap to send the details to anyone." },
  { icon: Users, title: "Follow-ups and pipeline", body: "Mila tells you who needs a message today and drafts it. Buyers sit in clear stages." },
  { icon: NotebookPen, title: "Meeting prep", body: "Walk in knowing what they want, which homes fit, and what you talked about last time." },
  { icon: FileCheck2, title: "Deal checklist to closing", body: "A countdown and a checklist for every deal, so nothing slips between contract and keys." },
  { icon: Mic, title: "Log a call by voice", body: "Say what happened. Mila turns it into a clean note and the next step." },
  { icon: SunMoon, title: "Looks like the sky outside", body: "Bright in the day, deep and starry at night. It feels like an app you want to open." },
];

const STEPS = [
  { t: "Say it", d: "Type or speak a request in plain English, like you'd text an assistant." },
  { t: "Review it", d: "Everything Mila prepared lands in one approval queue. Edit anything, skip anything." },
  { t: "Send it", d: "Approve with a tap. Messages open in your own apps. Nothing goes out without you." },
];

export default function Page() {
  return (
    <main>
      {/* HERO */}
      <SiteNav />
      <section id="top" className="sky grain relative isolate overflow-hidden px-5 pb-24 pt-6 text-white sm:pb-32">
        <Clouds />
        <div className="pointer-events-none absolute left-1/2 top-24 -z-0 h-[520px] w-[820px] max-w-[140vw] -translate-x-1/2 rounded-full bg-white/25 blur-[110px]" aria-hidden />
        <div className="h-14" aria-hidden />
        <div className="pointer-events-none absolute left-1/2 top-[76px] -z-0 h-[300px] w-[min(920px,130vw)] -translate-x-1/2" aria-hidden>
          <div className="absolute inset-x-0 bottom-0 h-[640px] rounded-t-full border-t-2 border-dotted border-white/50" style={{ transformOrigin: "50% 100%" }} />
          <div className="absolute inset-0" style={{ transformOrigin: "50% 100%", animation: "orbit 14s ease-in-out infinite alternate" }}>
            <span className="absolute left-1/2 top-0 block h-5 w-5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_40px_10px_rgba(255,255,255,.75)]"><span className="absolute inset-0 translate-x-1 rounded-full bg-[#7c6cf0]" /></span>
          </div>
        </div>
        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center pt-14 text-center sm:pt-20">
          <p className="glass mb-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-semibold text-zinc-900"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />Launching October 20 · 7-day free trial</p>
          <h1 className="display text-balance text-[clamp(46px,9vw,92px)] [text-shadow:0_2px_30px_rgba(80,50,200,.35)]">Your AI operations manager for real estate.</h1>
          <p className="mt-6 max-w-2xl text-balance text-[clamp(17px,2.4vw,21px)] leading-relaxed text-white [text-shadow:0_1px_18px_rgba(80,50,200,.45)]">Tell Mila what you need. She preps your listings, writes your posts and emails, sets up open houses and follow-ups, and asks before anything goes out.</p>
          <div id="join" className="mt-10 w-full scroll-mt-10"><WaitlistForm id="hero" /></div>
          <div className="mt-14"><p className="mb-4 text-[12.5px] font-semibold uppercase tracking-[.2em] text-white/85">Doors open in</p><FlipClock to={LAUNCH_AT} /></div>
        </div>
      </section>

      {/* SCROLL SHOWCASE */}
      <section className="relative bg-paper">
        <ContainerScroll titleComponent={<><p className="text-[12.5px] font-semibold uppercase tracking-[.2em] text-muted-foreground">One sentence</p><h2 className="display mt-3 text-balance text-[clamp(40px,7vw,84px)] text-foreground">Your whole day, handled.</h2><p className="mx-auto mt-4 max-w-xl text-balance text-[17px] text-muted-foreground">Home shows what needs your OK, what Mila already did, and what's next.</p></>}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/screens/d-home.webp" alt="The Mila home screen on desktop with a request box and an approval queue" className="mx-auto h-full w-full rounded-2xl object-cover object-left-top" draggable={false} />
        </ContainerScroll>
      </section>

      {/* FEATURES */}
      <section className="bg-paper px-5 pb-24 pt-8 sm:pb-32">
        <div className="mx-auto max-w-6xl">
          <Reveal><p className="text-center text-[12.5px] font-semibold uppercase tracking-[.2em] text-muted-foreground">Everything in one place</p>
          <h2 className="display mx-auto mt-3 max-w-3xl text-balance text-center text-[clamp(36px,6vw,64px)]">Everything an agent juggles. One assistant.</h2></Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }, i) => (
              <Reveal key={title} delay={(i % 3) * 0.08} className="h-full"><article className="group relative h-full overflow-hidden rounded-3xl border border-border bg-white p-7 transition duration-500 hover:-translate-y-1.5 hover:border-iris/50 hover:shadow-[0_30px_70px_-28px_rgba(110,80,230,.45)]">
                <span className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-sky/40 via-iris/30 to-peach/40 opacity-0 blur-2xl transition duration-500 group-hover:opacity-100" aria-hidden />
                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-zinc-900 transition group-hover:bg-zinc-900 group-hover:text-white"><Icon size={22} aria-hidden /></span>
                <h3 className="text-[19px] font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 text-[15.5px] leading-relaxed text-muted-foreground">{body}</p>
              </article></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* INTERACTIVE */}
      <section className="relative isolate overflow-hidden bg-night px-5 py-24 text-white sm:py-32">
        <div className="stars absolute inset-0 -z-10" aria-hidden />
        <div className="absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-iris/25 to-transparent" aria-hidden />
        <Reveal className="mx-auto max-w-5xl text-center">
          <p className="text-[12.5px] font-semibold uppercase tracking-[.2em] text-white/60">Try it</p>
          <h2 className="display mx-auto mt-3 max-w-3xl text-balance text-[clamp(36px,6vw,64px)]">Say one thing. Watch the work appear.</h2>
          <p className="mx-auto mt-4 max-w-xl text-white/70">Pick a request, then approve what Mila prepared.</p>
        </Reveal>
        <div className="mt-12"><TryMila /></div>
      </section>

      {/* PHONE */}
      <section className="relative isolate overflow-hidden px-5 py-24 text-white sm:py-32" style={{ background: "linear-gradient(180deg,#07070b 0%,#1a1240 55%,#5a46c8 100%)" }}>
        <div className="stars absolute inset-0 -z-10" aria-hidden />
        <Reveal className="mx-auto max-w-5xl text-center">
          <p className="text-[12.5px] font-semibold uppercase tracking-[.2em] text-white/60">Built for your phone</p>
          <h2 className="display mx-auto mt-3 max-w-3xl text-balance text-[clamp(36px,6vw,64px)]">The real app. In your pocket.</h2>
        </Reveal>
        <div className="mt-12"><PhoneMockupBasic /></div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-paper px-5 py-24 sm:py-32">
        <div className="mx-auto max-w-5xl">
          <Reveal><h2 className="display mx-auto max-w-3xl text-balance text-center text-[clamp(36px,6vw,64px)]">Mila asks before anything goes out.</h2></Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.t} delay={i * 0.1}><div className="h-full rounded-3xl border border-border bg-white p-7 transition duration-500 hover:-translate-y-1 hover:shadow-[0_26px_60px_-30px_rgba(110,80,230,.4)]">
                <p className="display text-[56px] leading-none text-iris">{i + 1}</p>
                <h3 className="mt-3 text-[22px] font-semibold tracking-tight">{s.t}</h3>
                <p className="mt-2 text-[15.5px] leading-relaxed text-muted-foreground">{s.d}</p>
              </div></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* BROKERAGES */}
      <section className="bg-background px-5 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-8 text-balance text-center text-[clamp(22px,3.4vw,32px)] font-medium tracking-tight text-muted-foreground">Built for agents at <span className="font-semibold text-foreground">every brokerage</span>.</h2>
          <Reveal><LogoCloud /></Reveal>
          <p className="mx-auto mt-6 max-w-xl text-center text-[12.5px] leading-relaxed text-muted-foreground">Mila is an independent product. Brokerage names are shown only to say who it is for. They belong to their owners, and no partnership or endorsement is implied.</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-paper px-5 py-24 sm:py-28">
        <h2 className="display mx-auto mb-10 max-w-3xl text-balance text-center text-[clamp(34px,5.5vw,56px)]">Questions, answered.</h2>
        <Faq />
      </section>

      {/* FINAL CTA */}
      <section className="sky grain relative isolate overflow-hidden px-5 py-28 text-center text-white sm:py-36">
        <Clouds />
        <Reveal className="relative z-10 mx-auto max-w-3xl">
          <h2 className="display text-balance text-[clamp(42px,8vw,84px)]">Be first in on October 20.</h2>
          <p className="mx-auto mt-5 max-w-xl text-balance text-[18px] text-white/90">We&apos;ll email your personal link the morning we open. Your 7-day free trial starts then.</p>
          <div className="mt-10 flex justify-center"><ScrollToJoin className="h-[56px] w-72 border-black/10 text-[16px] text-zinc-900" /></div>
        </Reveal>
      </section>

      <footer className="bg-night px-5 py-12 text-white/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 text-center sm:flex-row sm:text-left">
          <div><p className="display text-3xl text-white">Mila</p><p className="text-[14px]">Your AI operations manager for real estate.</p></div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[14px]" aria-label="Footer">
            <Link href="/privacy" className="hover:text-white">Privacy</Link><Link href="/terms" className="hover:text-white">Terms</Link>
            <a href="mailto:milarealestateapp@yahoo.com" className="hover:text-white">Contact</a>
          </nav>
        </div>
        <p className="mx-auto mt-8 max-w-6xl text-center text-[12.5px] text-white/45 sm:text-left">© 2026 Mila. Screens show fictional demo data.</p>
      </footer>
    </main>
  );
}
