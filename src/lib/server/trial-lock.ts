/** While a trial is over, every change is refused except these: buying a plan, signing out, support, bug reports, and deleting the account. */
const OK_WRITES = ["/api/billing/", "/api/stripe/", "/api/auth/", "/api/support", "/api/errors", "/api/feedback", "/api/privacy/delete", "/api/me"];
export const writeAllowedWhileLocked = (method: string, pathname: string) => method === "GET" || method === "HEAD" || method === "OPTIONS" || OK_WRITES.some((p) => pathname === p || pathname.startsWith(p));
export const LOCKED_MESSAGE = "Your free trial has ended, so your account is view-only. Choose a plan to make changes and chat with Mila again.";
