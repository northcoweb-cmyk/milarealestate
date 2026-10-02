import { Page } from "@/components/page";
import { Skeleton } from "@/components/ui";

/** Shown the instant you tap a tab, while the next screen loads. */
export default function Loading() {
  return (
    <Page>
      <Skeleton className="mb-3 h-10 w-1/2" />
      <Skeleton className="mb-6 h-5 w-2/3" />
      <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
    </Page>
  );
}
