import { api } from "@/lib/server/route";
import { referralSummary } from "@/lib/referral";

/** The person's referral link, who they've invited, and what they've earned. */
export const GET = api(async ({ profile }) => referralSummary(profile));
