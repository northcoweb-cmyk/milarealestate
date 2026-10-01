import { putFile } from "../files";
import { randomUUID } from "node:crypto";
import { fmtShortDate } from "../time";
import type { Contact, DocumentTemplate, Property } from "../types";
import type { Ctx } from "./context";

/**
 * Template filling. ONLY {{VARIABLE}} fields are replaced; the rest of the
 * document text is copied byte-for-byte. Mila never rewrites legal wording.
 */
export const KNOWN_VARS = ["CLIENT_NAME", "CLIENT_EMAIL", "CLIENT_PHONE", "DATE", "PROPERTY_ADDRESS", "AGENT_NAME", "BROKERAGE"] as const;

export function extractVariables(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]))];
}

export async function fillTemplate(ctx: Ctx, tmpl: DocumentTemplate, data: { contact?: Contact | null; property?: Property | null; extra?: Record<string, string> }) {
  const values: Record<string, string | undefined> = {
    CLIENT_NAME: data.contact?.name, CLIENT_EMAIL: data.contact?.email ?? undefined, CLIENT_PHONE: data.contact?.phone ?? undefined,
    DATE: fmtShortDate(ctx.now, ctx.tz) + ", " + new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, year: "numeric" }).format(ctx.now),
    PROPERTY_ADDRESS: data.property?.address, AGENT_NAME: ctx.profile.full_name, BROKERAGE: ctx.profile.brokerage ?? undefined, ...data.extra,
  };
  const missing: string[] = [];
  const text = tmpl.body.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (m, k: string) => {
    const v = values[k];
    if (v) return v;
    if (!missing.includes(k)) missing.push(k);
    return m; // leave the field visible so nothing is silently blank
  });
  const id = randomUUID();
  const storage = await putFile(ctx.userId, id, Buffer.from(text, "utf8"), "text/plain");
  const doc = await ctx.store.insert("documents", ctx.userId, {
    id, name: `${tmpl.name}${data.contact ? ` — ${data.contact.name}` : ""}`, kind: "text", mime: "text/plain", size_bytes: Buffer.byteLength(text),
    storage_path: storage, text_content: text, extracted: { template_id: tmpl.id, missing }, property_id: data.property?.id ?? null, contact_id: data.contact?.id ?? null,
    summary: missing.length ? `Needs: ${missing.join(", ")}` : "Ready to review",
  } as any);
  await ctx.store.insert("tasks", ctx.userId, {
    kind: "document", title: `Review ${doc.name}`, subtitle: missing.length ? `Fill in: ${missing.join(", ")}` : "Check before sending", priority: "important", priority_reason: null,
    status: "open", due_at: null, contact_id: data.contact?.id ?? null, property_id: data.property?.id ?? null, approval_id: null, workflow_run_id: null, completed_at: null,
  });
  return { doc, missing };
}
