import { getStore } from "./db/store";
import type { Workflow, WorkflowStep } from "./types";

type Def = { key: string; name: string; description: string; steps: WorkflowStep[] };

const s = (tool: string, label: string, optional = false): WorkflowStep => ({ tool, label, optional });

/**
 * Built-in real-estate workflows. They are seeded per user and fully editable
 * (More → Workflows). Steps that map to an implemented tool run automatically;
 * the rest become checklist tasks so nothing is silently skipped.
 */
export const BUILTIN_WORKFLOWS: Def[] = [
  { key: "new_buyer", name: "New buyer", description: "Set up a buyer: profile, search criteria, follow-up and intake.", steps: [
    s("create_contact", "Create buyer profile"), s("save_memory", "Save search criteria"), s("create_task", "Schedule first follow-up"),
    s("create_task", "Send buyer intake / agency documents", true), s("create_reminder", "Check-in reminder", true) ] },
  { key: "new_seller", name: "New seller", description: "Listing consultation, pricing review and listing prep.", steps: [
    s("create_contact", "Create seller profile"), s("create_task", "Prepare comparative market analysis"), s("create_task", "Schedule listing consultation"),
    s("create_task", "Send listing agreement", true), s("create_task", "Plan photography & staging", true) ] },
  { key: "new_rental", name: "New rental client", description: "Capture rental criteria and set follow-ups.", steps: [
    s("create_contact", "Create rental client"), s("save_memory", "Save rental criteria"), s("create_task", "Schedule follow-up") ] },
  { key: "new_listing", name: "New listing", description: "Launch a listing: property record, marketing, announcement.", steps: [
    s("create_property", "Create property record"), s("create_task", "Upload property photos"), s("create_social_post", "Draft 'Just Listed' post"),
    s("draft_email", "Draft announcement email"), s("create_task", "Verify listing details") ] },
  { key: "open_house", name: "Open house", description: "Calendar, reminder, email, social post, checklist and follow-up plan.", steps: [
    s("create_calendar_event", "Calendar event"), s("create_reminder", "Reminder"), s("find_contacts", "Relevant contact list"),
    s("draft_email", "Open-house email"), s("create_social_post", "Social post"), s("create_task", "Open-house checklist"),
    s("create_task", "Follow-up plan") ] },
  { key: "showing", name: "Showing", description: "Schedule a showing and prepare follow-up.", steps: [
    s("create_calendar_event", "Calendar event"), s("create_reminder", "Reminder"), s("create_task", "Post-showing follow-up") ] },
  { key: "post_showing", name: "Post-showing follow-up", description: "Feedback request and next steps.", steps: [
    s("draft_email", "Thank-you / feedback email"), s("create_task", "Log feedback"), s("create_task", "Next showing suggestions", true) ] },
  { key: "new_lead", name: "New lead", description: "Respond quickly and qualify.", steps: [
    s("create_contact", "Create lead"), s("draft_email", "Intro message"), s("create_task", "Qualifying call") ] },
  { key: "past_client", name: "Past client follow-up", description: "Stay in touch: anniversary, referral ask, market update.", steps: [
    s("draft_email", "Check-in message"), s("create_task", "Referral ask", true) ] },
  { key: "price_reduction", name: "Price reduction", description: "Announce a price change.", steps: [
    s("create_task", "Update listing price"), s("create_social_post", "Price-reduction post"), s("draft_email", "Notify interested buyers") ] },
  { key: "just_listed", name: "Just listed", description: "Announce a new listing.", steps: [
    s("create_social_post", "Just-listed post"), s("draft_email", "Announcement email") ] },
  { key: "just_sold", name: "Just sold", description: "Celebrate and market a closing.", steps: [
    s("create_social_post", "Just-sold post"), s("draft_email", "Thank-you to client"), s("create_task", "Ask for review / referral", true) ] },
  { key: "transaction", name: "Transaction", description: "Contract-to-close milestones.", steps: [
    s("create_task", "Confirm key contract dates"), s("create_task", "Inspection scheduling"), s("create_task", "Financing / appraisal check-in"), s("create_task", "Final walkthrough"), s("create_task", "Closing day") ] },
  { key: "referral", name: "Referral", description: "Handle an incoming or outgoing referral.", steps: [
    s("create_contact", "Create contact"), s("create_task", "Thank the referrer"), s("create_task", "Follow up with referral") ] },
  { key: "investor", name: "Investor", description: "Capture investment criteria and track deals.", steps: [
    s("create_contact", "Create investor profile"), s("save_memory", "Save investment criteria"), s("create_task", "Share relevant opportunities") ] },
  { key: "commercial_lead", name: "Commercial lead", description: "Qualify a commercial inquiry.", steps: [
    s("create_contact", "Create contact"), s("create_task", "Qualify requirements (use, size, budget, timeline)"), s("create_task", "Schedule call") ] },
];

export async function ensureBuiltinWorkflows(userId: string) {
  const store = getStore();
  const have = new Set((await store.list("workflows", userId)).map((w) => w.key));
  for (const d of BUILTIN_WORKFLOWS) {
    if (have.has(d.key)) continue;
    await store.insert("workflows", userId, { key: d.key, name: d.name, description: d.description, steps: d.steps, is_builtin: true, enabled: true });
  }
}

export async function getWorkflow(userId: string, key: string): Promise<Workflow | undefined> {
  await ensureBuiltinWorkflows(userId);
  return (await getStore().list("workflows", userId)).find((w) => w.key === key);
}
