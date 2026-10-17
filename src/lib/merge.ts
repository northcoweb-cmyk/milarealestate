import { firstNameOf } from "./names";

/**
 * Drafts keep a {{first_name}} blank while they are written; everything a person SEES or SENDS has it filled in:
 * one recipient gets their real first name, several recipients (one email to many) get "there".
 */
export function renderMerge(body: string, recipients: { name: string }[]): string {
  const first = recipients.length === 1 && recipients[0].name?.trim() ? firstNameOf(recipients[0].name) : "there";
  return String(body ?? "").replaceAll("{{first_name}}", first);
}

/** Any {{blank}} still left in a message (a tag Mila doesn't know how to fill), so it can be stopped before it goes out. */
export const unresolvedBlanks = (s: string): string[] => [...new Set([...String(s ?? "").matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]))];
