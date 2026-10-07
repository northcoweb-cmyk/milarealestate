import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/components/motion-provider";
import { SmoothScroll } from "@/components/smooth-scroll";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });

const title = "Mila: your AI operations manager for real estate";
const description = "Tell Mila what you need in plain English. She preps your listings, writes your posts and emails, sets up open houses and follow-ups, and asks before anything goes out. Join the waitlist for a 7-day free trial.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://milarealestate-waitlist.vercel.app"),
  title: { default: "Mila | AI for Real Estate", template: "%s · Mila" }, description, applicationName: "Mila",
  openGraph: { title, description, type: "website", siteName: "Mila" },
  twitter: { card: "summary_large_image", title, description },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#a68cff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${inter.variable} ${display.variable}`}><body><SmoothScroll /><MotionProvider>{children}</MotionProvider></body></html>;
}
