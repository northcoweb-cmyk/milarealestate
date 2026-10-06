import { cn } from "@/lib/cn";

type LogoCloudProps = React.ComponentProps<"div">;

/** Brokerage names set as plain type (no logos, no endorsement implied). */
const NAMES = ["Compass", "eXp Realty", "Keller Williams", "RE/MAX", "Coldwell Banker", "Century 21", "Berkshire Hathaway HomeServices", "Long & Foster"];

export function LogoCloud({ className, ...props }: LogoCloudProps) {
  return (
    <div className={cn("relative grid grid-cols-2 border-x border-border md:grid-cols-4", className)} {...props}>
      <div className="pointer-events-none absolute -top-px left-1/2 w-screen -translate-x-1/2 border-t border-border" />
      {NAMES.map((n, i) => (
        <LogoCard key={n} name={n} className={cn(
          i % 2 === 0 ? "border-r" : "border-r-0", i < 6 ? "border-b" : "border-b-0",
          i % 4 !== 3 ? "md:border-r" : "md:border-r-0", i < 4 ? "md:border-b" : "md:border-b-0",
          "border-border", [0, 3, 5, 6].includes(i) && "bg-secondary/60",
        )} />
      ))}
      <div className="pointer-events-none absolute -bottom-px left-1/2 w-screen -translate-x-1/2 border-b border-border" />
    </div>
  );
}

function LogoCard({ name, className, children }: { name: string; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("relative flex items-center justify-center bg-background px-4 py-8 text-center md:p-8", className)}>
      <span className="select-none text-[15px] font-semibold tracking-tight text-foreground/70 md:text-[17px]">{name}</span>
      {children}
    </div>
  );
}
