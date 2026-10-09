/** Accounts that are real agents helping test Mila. They get a bug-flag button everywhere. Add more with TESTER_EMAILS (comma separated). */
const DEFAULT_TESTERS = ["sarahpark0506@gmail.com", "rystillwell06@gmail.com", "northcoweb@yahoo.com"];
export function testerEmails(): string[] {
  return [...DEFAULT_TESTERS, ...(process.env.TESTER_EMAILS ?? "").split(",")].map((e) => e.trim().toLowerCase()).filter(Boolean);
}
export const isTester = (email: string | null | undefined) => !!email && testerEmails().includes(email.trim().toLowerCase());

/** Test accounts are never stopped by the trial clock, the credit balance or the small trial AI allowance: they are here to try everything. Real customers keep every limit. */
export async function isTesterId(userId: string): Promise<boolean> {
  try {
    const { getStore } = await import("./db/store");
    const p = await getStore().get("profiles", userId, userId);
    return isTester(p?.email);
  } catch { return false; }
}
export const TESTER_AI_MONTH_USD = () => Number(process.env.MILA_TESTER_AI_BUDGET_USD) || 40;
export const TESTER_TOPUP_CREDITS = 3000;
