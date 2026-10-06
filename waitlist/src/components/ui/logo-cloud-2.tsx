import { cn } from "@/lib/cn";

type LogoCloudProps = React.ComponentProps<"div">;

/**
 * Add a brokerage: drop its logo in /public/logos (PNG or SVG, transparent background) and add one line here.
 * `h` sets how tall it shows, so wide logos (like Compass) and square ones look balanced.
 */
export const LOGOS: { name: string; src: string; h: string }[] = [
  { name: "eXp Realty", src: "/logos/exp.png", h: "h-12 md:h-14" },
  { name: "Compass", src: "/logos/compass.png", h: "h-5 md:h-6" },
  { name: "Keller Williams", src: "/logos/kw.png", h: "h-12 md:h-14" },
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={l.src} alt={l.name} className={cn("w-auto max-w-[78%] select-none object-contain opacity-70 grayscale transition duration-500 group-hover:opacity-100 group-hover:grayscale-0", l.h)} draggable={false} loading="lazy" />
          </div>
        );
      })}
      <div className="pointer-events-none absolute -bottom-px left-1/2 w-screen -translate-x-1/2 border-b border-border" />
    </div>
  );
}
