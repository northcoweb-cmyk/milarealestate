// Domain model. Field names are snake_case and mirror the Postgres schema in
// supabase/migrations so the same rows work in the local store and Supabase.

export type ID = string;

export interface Row {
  id: ID;
  user_id: ID;
  created_at: string;
  updated_at: string;
}

// ---------- Profile / settings ----------

export type ExperienceLevel = "new" | "growing" | "experienced" | "team";
export type BusinessType = "buyer" | "seller" | "rental" | "commercial" | "investor" | "mixed";

export type AutonomyKey =
  | "contacts"
  | "calendar"
  | "calendar_changes"
  | "email_drafts"
  | "email_sending"
  | "tasks"
  | "reminders"
  | "social_posts"
  | "sms";

export type AutonomyMode = "ask" | "auto";
export type Autonomy = Record<AutonomyKey, AutonomyMode>;

export interface NotificationPrefs {
  channels: { email: boolean; browser: boolean; pwa: boolean; calendar: boolean; sms: boolean };
  topics: {
    daily_summary: boolean;
    task_reminders: boolean;
    approval_reminders: boolean;
    lead_alerts: boolean;
    calendar_conflicts: boolean;
    follow_up_reminders: boolean;
  };
}

export interface ProfileSettings {
  autonomy: Autonomy;
  notifications: NotificationPrefs;
  appearance: { theme: "auto" | "day" | "night"; reduce_motion: boolean; animated_sky?: boolean };
  privacy: { store_conversations: boolean };
}

export interface Profile extends Row {
  email: string;
  full_name: string;
  role: string; // "Agent", "Broker", "Team lead"...
  brokerage: string | null;
  location: string; // "Gaithersburg, MD"
  primary_market: string;
  timezone: string;
  lat: number | null; // approximate (rounded) — only if user allows
  lng: number | null;
  experience: ExperienceLevel;
  business_type: BusinessType;
  onboarded: boolean;
  is_demo: boolean;
  settings: ProfileSettings;
}

export interface Business extends Row {
  name: string;
  license_state: string | null;
  signature: string | null;
  service_areas: string[];
}

// ---------- Contacts ----------

export const CONTACT_TYPES = [
  "buyer", "seller", "rental", "investor", "past_client", "lead", "vendor", "agent", "other",
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const CONTACT_STATUSES = [
  "new", "contacted", "qualified", "active", "showing", "offer", "under_contract", "closed", "nurture", "inactive",
] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export interface ContactPreferences {
  beds_min?: number;
  baths_min?: number;
  features?: string[];
  property_types?: string[];
  [k: string]: unknown;
}

export interface Contact extends Row {
  name: string;
  email: string | null;
  phone: string | null;
  type: ContactType;
  status: ContactStatus;
  tags: string[];
  notes: string | null;
  preferences: ContactPreferences;
  location: string | null;
  budget_min: number | null;
  budget_max: number | null;
  timeline: string | null;
  source: string | null;
  importance: 1 | 2 | 3; // 3 = high value client
  last_contact_at: string | null;
  next_action: string | null;
  next_action_at: string | null;
  avatar_color: string;
}

export interface ContactNote extends Row {
  contact_id: ID;
  body: string;
}

export interface ContactEvent extends Row {
  contact_id: ID;
  kind: string; // added, email_sent, showing, status_changed, note, import, call ...
  title: string;
  detail: string | null;
  occurred_at: string;
}

// ---------- Properties ----------

export interface Property extends Row {
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  list_price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  listing_url: string | null;
  description: string | null;
  verified: boolean; // facts above were confirmed by the agent
  is_demo: boolean;
}

export interface PropertyImage extends Row {
  property_id: ID;
  document_id: ID | null;
  url: string; // served from /api/files/<id> or external URL
  caption: string | null;
  position: number;
  source: "upload" | "listing";
}

// ---------- Calendar ----------

export type CalendarEventKind = "showing" | "open_house" | "call" | "meeting" | "lunch" | "closing" | "other";

export interface CalendarEvent extends Row {
  title: string;
  kind: CalendarEventKind;
  start_at: string;
  end_at: string;
  location: string | null;
  property_id: ID | null;
  contact_id: ID | null;
  status: "confirmed" | "cancelled";
  source: "mila" | "manual" | "google";
  external_id: string | null;
  synced_at: string | null; // set only when pushed to Google Calendar
  workflow_run_id: ID | null;
  notes: string | null;
}

// ---------- Tasks / approvals ----------

export type TaskKind = "approval" | "follow_up" | "reminder" | "task" | "event" | "document" | "communication";
export type TaskPriority = "urgent" | "important" | "upcoming" | "low";
export type TaskStatus = "open" | "done" | "dismissed";

export interface Task extends Row {
  kind: TaskKind;
  title: string;
  subtitle: string | null;
  priority: TaskPriority;
  priority_reason: string | null;
  status: TaskStatus;
  due_at: string | null;
  contact_id: ID | null;
  property_id: ID | null;
  approval_id: ID | null;
  workflow_run_id: ID | null;
  completed_at: string | null;
}

export type ApprovalAction =
  | "send_email"
  | "send_bulk_email"
  | "send_sms"
  | "publish_social"
  | "calendar_create"
  | "calendar_change"
  | "calendar_cancel"
  | "send_document"
  | "delete"
  | "other";

export interface ApprovalPayload {
  tool: string;
  args: Record<string, unknown>;
}

export interface Approval extends Row {
  action: ApprovalAction;
  title: string;
  summary: string | null;
  payload: ApprovalPayload;
  risk: "normal" | "high";
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  result: Record<string, unknown> | null;
  error: string | null; // human-readable reason when blocked/failed
  blocked_integration: string | null; // e.g. "gmail" when approved but not connected
  workflow_run_id: ID | null;
  decided_at: string | null;
  executed_at: string | null;
}

// ---------- Communications ----------

export interface EmailDraft extends Row {
  contact_id: ID | null;
  to_contact_ids: ID[];
  to_emails: string[];
  subject: string;
  body: string;
  status: "draft" | "pending_approval" | "sent" | "failed" | "approved_unsent";
  workflow_run_id: ID | null;
  property_id: ID | null;
  event_id: ID | null;
  stale: boolean; // underlying event changed after this was written
  stale_reason: string | null;
  gmail_message_id: string | null;
  sent_at: string | null;
}

export interface EmailRecord extends Row {
  // Logged communications (sent or received) associated with contacts.
  contact_id: ID | null;
  direction: "in" | "out";
  subject: string;
  snippet: string | null;
  external_id: string | null;
  occurred_at: string;
}

export interface SocialSlide {
  headline: string;
  sub?: string;
  image_id?: ID | null; // legacy: a property_images id
  /** Same-origin photo URL (a property photo the agent owns), drawn full-bleed behind the text. */
  image_url?: string | null;
  /** Design palette (see lib/content/design.ts). */
  theme?: string;
  /** Layout template (see lib/content/design.ts). */
  layout?: string;
  role: "hero" | "highlight" | "cta";
}

export interface SocialPost extends Row {
  platform: "instagram" | "facebook" | "tiktok" | "x" | "linkedin";
  caption: string;
  hashtags: string[];
  slides: SocialSlide[];
  /** draft → (pending_approval) → approved_unpublished ("Ready to post") → scheduled → published ("Posted"); archived hides it */
  status: "draft" | "pending_approval" | "approved_unpublished" | "scheduled" | "published" | "archived" | "failed";
  category?: string | null;
  posted_at?: string | null;
  variant?: number | null;
  property_id: ID | null;
  event_id: ID | null;
  workflow_run_id: ID | null;
  scheduled_for: string | null;
  stale: boolean;
  stale_reason: string | null;
}

export type SocialPlatform = SocialPost["platform"];

export interface Reminder extends Row {
  title: string;
  remind_at: string;
  channels: ("pwa" | "browser" | "email" | "calendar" | "sms")[];
  status: "pending" | "delivered" | "done" | "cancelled";
  contact_id: ID | null;
  event_id: ID | null;
  workflow_run_id: ID | null;
  delivered_at: string | null;
}

export interface Notification extends Row {
  channel: "pwa" | "browser" | "email" | "sms";
  title: string;
  body: string | null;
  status: "queued" | "sent" | "unavailable" | "read";
  related_task_id: ID | null;
}

// ---------- Documents / templates ----------

export interface DocumentRow extends Row {
  name: string;
  kind: "pdf" | "image" | "csv" | "spreadsheet" | "text" | "other";
  mime: string;
  size_bytes: number;
  storage_path: string;
  text_content: string | null;
  extracted: Record<string, unknown> | null;
  property_id: ID | null;
  contact_id: ID | null;
  summary: string | null;
}

export type TemplateKind = "buyer_document" | "seller_document" | "follow_up" | "email" | "social" | "open_house" | "checklist";

export interface DocumentTemplate extends Row {
  name: string;
  kind: TemplateKind;
  body: string; // may contain {{VARIABLES}}
  variables: string[];
  document_id: ID | null;
  is_default: boolean;
}

// ---------- Workflows / memory ----------

export interface WorkflowStep {
  tool: string;
  label: string;
  optional?: boolean;
}

export interface Workflow extends Row {
  key: string; // new_buyer, open_house, ...
  name: string;
  description: string;
  steps: WorkflowStep[];
  is_builtin: boolean;
  enabled: boolean;
}

export interface WorkflowRun extends Row {
  workflow_key: string;
  title: string;
  subtitle: string | null;
  status: "running" | "waiting_approval" | "completed" | "failed";
  params: Record<string, unknown>;
  plan: { label: string; tool: string; state: "done" | "pending" | "needs_approval" | "skipped" | "failed"; detail?: string }[];
  outputs: Record<string, unknown>;
}

export type MemoryScope = "user" | "contact" | "property" | "business" | "workflow";

export interface Memory extends Row {
  scope: MemoryScope;
  subject_id: ID | null;
  key: string;
  value: string;
  source: "user_stated" | "inferred" | "imported" | "system";
  confidence: number; // 0..1
  pinned: boolean;
}

// ---------- Conversation ----------

export interface Conversation extends Row {
  title: string | null;
  state: ConversationState;
}

export interface ConversationState {
  last_workflow_run_id?: ID | null;
  last_event_id?: ID | null;
  last_property_id?: ID | null;
  last_contact_ids?: ID[];
  last_import_batch?: ID[]; // contact ids from most recent sign-in/import
  pending?: PendingQuestion | null;
}

export type PendingQuestion =
  | { kind: "calendar_conflict"; draft: Record<string, unknown>; conflict_ids: ID[] }
  | { kind: "stale_comms"; event_id: ID; email_ids: ID[]; social_ids: ID[] }
  | { kind: "clarify"; intent: string; slots: Record<string, unknown>; missing: string };

export interface Message extends Row {
  conversation_id: ID;
  role: "user" | "mila";
  content: string;
  blocks: Block[];
  attachments: { id: ID; name: string; kind: string }[];
}

// ---------- UI blocks (rich cards rendered inside Mila replies) ----------

export interface ActionButton {
  label: string;
  style?: "primary" | "secondary" | "quiet";
  // One of:
  action?: { type: string; [k: string]: unknown }; // sent to /api/agent
  href?: string;
  approvalId?: ID;
}

export type Block =
  | {
      type: "workflow";
      runId: ID;
      kicker: string; // OPEN HOUSE
      title: string; // 123 Main Street
      subtitle: string; // Sunday • 1:00 PM
      items: { label: string; state: "done" | "pending" | "needs_approval" | "skipped" | "failed"; detail?: string }[];
      footer?: string;
      buttons?: ActionButton[];
    }
  | { type: "notice"; tone: "info" | "warn" | "error" | "success"; title: string; body?: string; buttons?: ActionButton[] }
  | { type: "choice"; title: string; body?: string; buttons: ActionButton[] }
  | { type: "contacts"; title: string; contacts: { id: ID; name: string; type: string; reason?: string; color: string }[]; buttons?: ActionButton[] }
  | { type: "priorities"; groups: { priority: TaskPriority; items: { id: ID; title: string; subtitle?: string; reason?: string; href?: string }[] }[]; buttons?: ActionButton[] }
  | { type: "debrief"; greeting: string; counts: { appointments: number; followups: number; approvals: number }; noticed: string[]; buttons?: ActionButton[] }
  | { type: "draft_email"; draftId: ID; to: string; subject: string; body: string; status: string; buttons?: ActionButton[] }
  | { type: "draft_social"; postId: ID; platform: string; caption: string; slides: SocialSlide[]; status: string; buttons?: ActionButton[] }
  | { type: "market"; title: string; location: string; asOf: string; dataPeriod: string; bullets: string[]; sources: { title: string; url: string }[] }
  | { type: "event"; eventId: ID; title: string; when: string; where?: string; status?: string };

// ---------- Credits / billing ----------

export interface UsageRow extends Row {
  conversation_id: ID | null;
  operation: string;
  tier: string;
  provider: string;
  model: string;
  input_units: number;
  output_units: number;
  est_cost_usd: number;
  credits: number;
}

export interface CreditTransaction extends Row {
  kind: "grant" | "spend" | "purchase" | "reset" | "adjust";
  delta: number;
  balance_after: number;
  reason: string;
  usage_id: ID | null;
}

export interface Subscription extends Row {
  plan_key: string;
  status: "dev" | "active" | "past_due" | "canceled";
  credits_per_period: number;
  period_start: string;
  period_end: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export interface Integration extends Row {
  provider: "google" | "outlook" | "twilio" | "meta" | "mls";
  status: "connected" | "error" | "revoked";
  account_label: string | null;
  scopes: string[];
  token_encrypted: string | null; // never sent to the client
  error: string | null;
  connected_at: string | null;
}

// Global (non per-user) configuration editable by the business owner.
export interface PlanConfig {
  key: string;
  name: string;
  price_usd: number;
  credits: number;
  blurb: string;
}

export interface CreditPackConfig {
  credits: number;
  price_usd: number;
}

export interface AppConfig {
  credit_costs: Record<string, number>;
  plans: PlanConfig[];
  packs: CreditPackConfig[];
  dev_credits: number; // credits granted to accounts when billing isn't configured
}

export const TABLES = [
  "profiles", "businesses", "contacts", "contact_notes", "contact_events", "properties", "property_images",
  "calendar_events", "tasks", "approvals", "documents", "document_templates", "workflows", "workflow_runs",
  "memories", "emails", "email_drafts", "social_posts", "reminders", "notifications", "integrations", "usage",
  "credit_transactions", "subscriptions", "conversations", "messages",
] as const;
export type TableName = (typeof TABLES)[number];

export interface TableMap {
  profiles: Profile;
  businesses: Business;
  contacts: Contact;
  contact_notes: ContactNote;
  contact_events: ContactEvent;
  properties: Property;
  property_images: PropertyImage;
  calendar_events: CalendarEvent;
  tasks: Task;
  approvals: Approval;
  documents: DocumentRow;
  document_templates: DocumentTemplate;
  workflows: Workflow;
  workflow_runs: WorkflowRun;
  memories: Memory;
  emails: EmailRecord;
  email_drafts: EmailDraft;
  social_posts: SocialPost;
  reminders: Reminder;
  notifications: Notification;
  integrations: Integration;
  usage: UsageRow;
  credit_transactions: CreditTransaction;
  subscriptions: Subscription;
  conversations: Conversation;
  messages: Message;
}
