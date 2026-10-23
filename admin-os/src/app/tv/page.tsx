import { redirect } from "next/navigation";

// Short address for the launch-day TV: type /tv, sign in once, then type /tv again.
export const dynamic = "force-dynamic";
export default function Tv() { redirect("/live"); }
