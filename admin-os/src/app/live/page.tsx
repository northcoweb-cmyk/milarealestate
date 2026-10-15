import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { LiveBoard } from "@/components/live-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mila live" };

export default async function Live() {
  if (!(await isAuthed())) redirect("/login");
  return <LiveBoard />;
}
