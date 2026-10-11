import { MobileGuards } from "@/components/mobile-guards";
import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, Playfair_Display, Cormorant_Garamond, DM_Serif_Display, Libre_Baskerville, Montserrat, Oswald } from "next/font/google";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600"], variable: "--font-playfair", display: "swap" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["600"], variable: "--font-cormorant", display: "swap" });
const dmserif = DM_Serif_Display({ subsets: ["latin"], weight: "400", variable: "--font-dmserif", display: "swap" });
const baskerville = Libre_Baskerville({ subsets: ["latin"], weight: ["700"], variable: "--font-baskerville", display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["800"], variable: "--font-montserrat", display: "swap" });
const oswald = Oswald({ subsets: ["latin"], weight: ["600"], variable: "--font-oswald", display: "swap" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });

const shareTitle = "Mila | Your AI operations manager for real estate";
const shareDescription = "Tell Mila what you want done. She preps your listings, posts, emails and follow-ups, and asks before anything goes out.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://milarealestate.vercel.app"),
  title: { default: "Mila | Dashboard", template: "%s · Mila" },
  openGraph: { title: shareTitle, description: shareDescription, type: "website", siteName: "Mila", images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Mila, your AI operations manager for real estate" }] },
  twitter: { card: "summary_large_image", title: shareTitle, description: shareDescription, images: ["/og.jpg"] },
  description: "Your AI operations manager for real estate. Tell Mila what you want done: she connects your listings, calendar, contacts, email and posts, remembers how you work, and asks before anything goes out.",
  applicationName: "Mila",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Mila", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover", interactiveWidget: "resizes-content", themeColor: "#f0f0f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${playfair.variable} ${cormorant.variable} ${dmserif.variable} ${baskerville.variable} ${montserrat.variable} ${oswald.variable}`} data-tone="day">
      <body>
        {children}
        <MobileGuards />
        <div className="rotate-lock" role="alert"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></svg><p>Turn your phone upright</p><span>Mila works in portrait.</span></div>
        <SwRegister />
      </body>
    </html>
  );
}
