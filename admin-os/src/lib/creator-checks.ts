// Plain data shared by pages and client components (kept out of creators.ts, which uses server-only code).
export const CHECKS: [key: string, label: string][] = [["shows_app", "Shows the real app working"], ["disclosure", "Says #sponsored (or #ad)"], ["tagged", "Has #milapartner and tags Mila"], ["no_claims", "No income or guaranteed-result claims"]];

/** What the automatic warnings on a submitted video mean, in plain words. */
export const FLAG_TEXT: Record<string, string> = {
  duplicate_other: "this exact link was already sent by another creator",
  handle_mismatch: "the account in the link isn't the handle on file for them",
  platform_mismatch: "the link is on a different platform than their profile",
};
