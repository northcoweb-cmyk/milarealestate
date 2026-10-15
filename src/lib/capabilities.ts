import { aiAvailable } from "./ai/provider";
import { googleConfigured } from "./integrations/google";
import { rentcastConfigured } from "./listing-data/rentcast";
import { zillapiKey } from "./media/providers/zillapi";

/**
 * One honest registry of what Mila can do right now. Responses and screens read this instead of marketing copy.
 *  live: works (a person may still need to connect their own account)
 *  internal_only: works inside Mila, nothing leaves it
 *  credentials_required: built, but the app's own keys/credentials are not configured on this deployment
 *  unsupported: not built (a manual path exists where noted)
 *  unavailable: temporarily down
 */
export type CapabilityState = "live" | "internal_only" | "credentials_required" | "unsupported" | "unavailable";
export interface Capability { key: string; label: string; state: CapabilityState; note: string }

export function capabilityRegistry(): Capability[] {
  const google = googleConfigured();
  return [
    { key: "calendar_internal", label: "Mila calendar", state: "live", note: "Works on its own, with no outside calendar." },
    { key: "calendar_google", label: "Google Calendar", state: google ? "live" : "credentials_required", note: google ? "Connect, approve access on Google's screen, choose a calendar. Mila adds the events she creates, with the client, address and notes inside." : "Google keys are not configured on this deployment." },
    { key: "calendar_apple", label: "Apple Calendar (and any calendar app)", state: "live", note: "One tap subscribes the calendar app to Mila's events, or add a single event as a file. Mila writes to it; she never reads it." },
    { key: "email_mailbox", label: "Email from your own mailbox", state: google ? "live" : "credentials_required", note: "Needs the person to connect Gmail. Gmail sending needs Google's app review." },
    { key: "email_handoff", label: "Email drafts opened in your mail app", state: "live", note: "Mila prepares it; you press send in your own app. Mila reports it as handed off, never as sent." },
    { key: "sms_handoff", label: "Text drafts opened in Messages", state: "live", note: "Mila prepares it; you press send. You tell Mila whether you sent it." },
    { key: "sms_sending", label: "Texting from a Mila number", state: "unsupported", note: "Not built. Carrier registration is required first." },
    { key: "social_publish", label: "Publishing posts for you", state: "unsupported", note: "Not built. Mila makes the images and caption; you post them." },
    { key: "crm_import", label: "Import contacts from a file, sheet or paste", state: "live", note: "Works without any CRM connection." },
    { key: "crm_connect", label: "Connect a CRM", state: "unsupported", note: "No CRM connector is built. Choice depends on pilot demand, API terms and authorization." },
    { key: "mls", label: "MLS data", state: "unsupported", note: "Needs a broker or association license. Not built." },
    { key: "listing_data", label: "Property facts and estimates", state: rentcastConfigured() ? "live" : "credentials_required", note: "Facts are marked for review; estimates are labeled as estimates." },
    { key: "listing_photos", label: "Listing photos", state: zillapiKey() ? "live" : "credentials_required", note: "Only used when the match to the address is confident." },
    { key: "street_view", label: "Street view of an address", state: process.env.GOOGLE_MAPS_API_KEY ? "live" : "credentials_required", note: "A preview of the address, not a verified photo of the building." },
    { key: "voice_input", label: "Voice input", state: "live", note: "Uses your phone or browser's speech recognition. Mila does not listen to or record your calls." },
    { key: "voice_output", label: "Read replies aloud", state: "live", note: "Uses your device's voice. No audio is stored." },
    { key: "ai", label: "Open-ended answers", state: aiAvailable() ? "live" : "unavailable", note: "Rule-based work (calendar, contacts, tasks, drafts) keeps working without it." },
    { key: "billing", label: "Plans and top-ups", state: process.env.STRIPE_SECRET_KEY ? "live" : "credentials_required", note: "Stripe checkout and customer portal." },
  ];
}
