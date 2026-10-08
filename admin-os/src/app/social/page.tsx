import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { SocialBoard, type Item } from "@/components/social-board";
import { Missing } from "@/components/ui";
import { getWho, isAuthed } from "@/lib/auth";
import { table } from "@/lib/sb";

export const dynamic = "force-dynamic";

export default async function Social() {
  if (!(await isAuthed())) redirect("/login");
  const who = await getWho();
  if (!who) redirect("/who");
  const items = await table<Item>("os_items", { select: "id,created_at,kind,day,platform,link,handle,note,by", order: "created_at.desc", max: 600 });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  return (
    <Shell title="Social" lead="1 to 2 posts a day on TikTok and X, talk to other realtors, and keep notes here.">
      <Missing tables={items === null ? ["os_items"] : []} />
      <SocialBoard items={items ?? []} today={today} who={who} />
    </Shell>
  );
}
