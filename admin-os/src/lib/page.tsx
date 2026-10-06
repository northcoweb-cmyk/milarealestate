import { redirect } from "next/navigation";
import { isAuthed } from "./auth";
import { configured } from "./sb";
import { buildReport } from "./data";

/** Every page: must be signed in, and the database keys must be set. Returns the report (or null when the keys are missing). */
export async function load() {
  if (!(await isAuthed())) redirect("/login");
  if (!configured()) return null;
  return buildReport();
}
export const NoKeys = () => <div className="note warn" style={{ marginTop: 20 }}>Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in this Vercel project&apos;s environment variables (same values as the Mila app), then redeploy.</div>;
