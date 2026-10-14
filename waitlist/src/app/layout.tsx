import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/components/motion-provider";
import { SmoothScroll } from "@/components/smooth-scroll";
import { FAQ_DATA, SITE } from "@/lib/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });

const title = "Mila: your AI operations manager for real estate";
const description = "Tell Mila what you need in plain English. She preps your listings, writes your posts and emails, sets up open houses and follow-ups, and asks before anything goes out. Join the waitlist for a 7-day free trial.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://milarealestate.app"),
  title: { default: "Mila Real Estate | AI operations manager for real estate agents", template: "%s · Mila Real Estate" }, description, applicationName: "Mila", alternates: { canonical: SITE }, keywords: ["Mila", "Mila Real Estate", "Mila AI", "AI for real estate agents", "real estate AI assistant", "AI operations manager", "open house follow up", "listing posts"], robots: { index: true, follow: true },
  openGraph: { title, description, type: "website", siteName: "Mila", images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Mila, your AI operations manager for real estate. Launching Oct 20." }] },
  twitter: { card: "summary_large_image", title, description, images: ["/og.jpg"] },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#a68cff" };

const LD = [
  { "@context": "https://schema.org", "@type": "Organization", name: "Mila", alternateName: ["Mila Real Estate", "Mila AI"], url: SITE, logo: `${SITE}/icon.png`, email: "admin@milarealestate.app", description: "Mila is an AI operations manager for real estate agents." },
  { "@context": "https://schema.org", "@type": "WebSite", name: "Mila Real Estate", alternateName: "Mila", url: SITE },
  { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Mila", applicationCategory: "BusinessApplication", operatingSystem: "iOS, Android, Web", description: "AI operations manager for real estate agents: listings, posts, emails, calendar and follow-ups, with approval before anything is sent.", url: SITE, offers: { "@type": "Offer", price: "39", priceCurrency: "USD", description: "7-day free trial, then $39 per month. Cancel any time." } },
  { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ_DATA.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${inter.variable} ${display.variable}`}><body>{LD.map((o, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o) }} />)}<SmoothScroll /><MotionProvider>{children}</MotionProvider></body></html>;
}
