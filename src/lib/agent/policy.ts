import { BULK_EMAIL_CONFIRM_THRESHOLD } from "../config";
import type { ApprovalAction, AutonomyKey, Profile } from "../types";

/**
 * Autonomy policy: decides whether a consequential tool call runs now or
 * becomes an approval. Settings can loosen "ask" to "auto" per category, but
 * high-risk actions (deletes, bulk sends, legal documents) ALWAYS ask.
 */
export interface Gate {
  key: AutonomyKey | null; // null = always ask (not user-configurable)
  risk: "normal" | "high";
  action: ApprovalAction;
  title: string;
  summary: string;
  dueAt?: string | null;
  contactId?: string | null;
  propertyId?: string | null;
}

export function mustAsk(profile: Profile, gate: Gate): boolean {
  if (gate.risk === "high" || gate.key === null) return true;
  return (profile.settings.autonomy[gate.key] ?? "ask") !== "auto";
}

export const isBulk = (recipients: number) => recipients > BULK_EMAIL_CONFIRM_THRESHOLD;
