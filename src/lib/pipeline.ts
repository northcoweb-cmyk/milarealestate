import type { ContactStatus } from "./types";

/** The real-estate pipeline, in order. Each stage groups one or more underlying contact statuses. */
export interface Stage { key: string; label: string; emoji: string; blurb: string; statuses: ContactStatus[]; set: ContactStatus }
export const STAGES: Stage[] = [
  { key: "new", label: "New lead", emoji: "🌱", blurb: "Just came in — no conversation yet", statuses: ["new"], set: "new" },
  { key: "contacted", label: "Contacted", emoji: "💬", blurb: "You've reached out", statuses: ["contacted"], set: "contacted" },
  { key: "qualified", label: "Qualified", emoji: "🎯", blurb: "Serious, with a plan and budget", statuses: ["qualified", "active"], set: "qualified" },
  { key: "showing", label: "Showing", emoji: "🏠", blurb: "Touring homes", statuses: ["showing"], set: "showing" },
  { key: "offer", label: "Offer", emoji: "📝", blurb: "Offer in progress", statuses: ["offer"], set: "offer" },
  { key: "contract", label: "Under contract", emoji: "🤝", blurb: "Heading to closing", statuses: ["under_contract"], set: "under_contract" },
  { key: "closed", label: "Closed", emoji: "🔑", blurb: "Deal done", statuses: ["closed"], set: "closed" },
  { key: "nurture", label: "Nurture", emoji: "⏳", blurb: "Not ready yet — keep in touch", statuses: ["nurture", "inactive"], set: "nurture" },
];
export const stageOf = (status: ContactStatus) => STAGES.find((s) => s.statuses.includes(status)) ?? STAGES[0];
