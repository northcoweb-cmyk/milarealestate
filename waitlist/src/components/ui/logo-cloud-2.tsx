import { cn } from "@/lib/cn";

type LogoCloudProps = React.ComponentProps<"div">;

/**
 * Add a brokerage: drop its logo in /public/logos (PNG or SVG, transparent background) and add one line here.
 * `h` sets how tall it shows, so wide logos (like Compass) and square ones look balanced.
 */
export const LOGOS: { name: string; src: string; h: string }[] = [
  { name: "eXp Realty", src: "/logos/exp.png", h: "h-12 md:h-14" },
  { name: "Compass", src: "/logos/compass.png", h: "h-4 md:h-5" },
  { name: "Keller Williams", src: "/logos/kw.png", h: "h-12 md:h-14" },
  { name: "RE/MAX", src: "/logos/remax.png", h: "h-8 md:h-9" },
  { name: "Century 21", src: "/logos/c21.png", h: "h-4 md:h-5" },
  { name: "Coldwell Banker", src: "/logos/cb.png", h: "h-14 md:h-16" },
  { name: "Berkshire Hathaway HomeServices", src: "/logos/bhhs.png", h: "h-14 md:h-16" },
  { name: "Long & Foster", src: "/logos/lf.png", h: "h-6 md:h-7" },
];

export function LogoCloud({ className, ...props }: LogoCloudProps) {
  const n = LOGOS.length;
  const mdCols = n <= 3 ? n : n <= 6 ? 3 : 4;
  const colsClass = { 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4" }[mdCols as 1 | 2 | 3 | 4];
  const mdRows = Math.ceil(n / mdCols), smRows = Math.ceil(n / 2);
  return (
    <div className={cn("relative mx-auto grid max-w-4xl grid-cols-2 border-x border-border", colsClass, className)} {...props}>
      <div className="pointer-events-none absolute -top-px left-1/2 w-screen -translate-x-1/2 border-t border-border" />
      {LOGOS.map((l, i) => {
        const smRow = Math.floor(i / 2), mdRow = Math.floor(i / mdCols);
        const lastSmCol = i % 2 === 1 || i === n - 1, lastMdCol = i % mdCols === mdCols - 1 || i === n - 1;
        return (
          <div key={l.name} className={cn(
            "group relative flex items-center justify-center bg-background px-4 py-9 md:py-12",
            n % 2 === 1 && i === n - 1 && "col-span-2 md:col-span-1",
            !lastSmCol && "border-r border-border", smRow < smRows - 1 && "border-b border-border",
            lastMdCol ? "md:border-r-0" : "md:border-r", mdRow < mdRows - 1 ? "md:border-b" : "md:border-b-0",
            i % 2 === 0 && "bg-secondary/50", "md:bg-background", i % 2 === 1 && "md:bg-secondary/50",
          )}>
            {/* Two stacked images (gray, and full color that fades in on hover): no live filters, so scrolling stays smooth. */}
            <span className={cn("relative block w-auto max-w-[78%]", l.h)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.src.replace("/logos/", "/logos/gray/")} alt={l.name} className={cn("block w-auto select-none object-contain opacity-80 transition-opacity duration-500 group-hover:opacity-0", l.h)} draggable={false} loading="lazy" decoding="async" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.src} alt="" aria-hidden className={cn("absolute inset-0 block w-auto select-none object-contain opacity-0 transition-opacity duration-500 group-hover:opacity-100", l.h)} draggable={false} loading="lazy" decoding="async" />
            </span>
          </div>
        );
      })}
      <div className="pointer-events-none absolute -bottom-px left-1/2 w-screen -translate-x-1/2 border-b border-border" />
    </div>
  );
}
