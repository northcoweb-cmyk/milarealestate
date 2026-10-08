/** Accounts that are real agents helping test Mila. They get a bug-flag button everywhere. Add more with TESTER_EMAILS (comma separated). */
const DEFAULT_TESTERS = ["sarahpark0506@gmail.com", "rystillwell06@gmail.com"];
export function testerEmails(): string[] {
  return [...DEFAULT_TESTERS, ...(process.env.TESTER_EMAILS ?? "").split(",")].map((e) => e.trim().toLowerCase()).filter(Boolean);
}
export const isTester = (email: string | null | undefined) => !!email && testerEmails().includes(email.trim().toLowerCase());
