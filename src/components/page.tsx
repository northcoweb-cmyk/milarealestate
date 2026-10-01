export function Page({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <main className={`mx-auto w-full ${wide ? "max-w-5xl" : "max-w-3xl"} px-4 pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+56px)] pt-[max(env(safe-area-inset-top),24px)] lg:px-8 lg:pb-16 lg:pt-10`}>{children}</main>;
}
export const TYPE_LABEL: Record<string, string> = { buyer: "Buyer", seller: "Seller", rental: "Rental", investor: "Investor", past_client: "Past client", lead: "Lead", vendor: "Vendor", agent: "Agent", other: "Other" };
export const STATUS_LABEL: Record<string, string> = { new: "New", contacted: "Contacted", qualified: "Qualified", active: "Active", showing: "Showing", offer: "Offer", under_contract: "Under contract", closed: "Closed", nurture: "Nurture", inactive: "Inactive" };
export const money = (n: number | null | undefined) => (n == null ? "" : `$${n.toLocaleString("en-US")}`);
export function ago(iso: string | null, now = Date.now()) {
  if (!iso) return "No contact yet";
  const d = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : d < 30 ? `${d} days ago` : d < 365 ? `${Math.floor(d / 30)} mo ago` : `${Math.floor(d / 365)} yr ago`;
}
