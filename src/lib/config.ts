import type { AppConfig } from "./types";

/**
 * Business-owner configuration. These are only DEFAULTS: the live values are
 * stored in the database (app_config) and editable at /admin (see
 * ADMIN_EMAILS), so pricing and credit economics are never hard-coded.
 */
export const DEFAULT_CONFIG: AppConfig = {
  credit_costs: {
    smalltalk: 0,
    chat_simple: 1,
    chat_complex: 3,
    email_generation: 2,
    social_generation: 2,
    document_analysis: 5,
    image_analysis: 3,
    image_generation: 10,
    market_research: 10,
    contact_import_base: 1,
    contact_import_per_25: 1,
    workflow_open_house: 4,
    workflow_default: 2,
    voice_transcription: 1,
  },
  plans: [
    { key: "pro", name: "Mila Pro", price_usd: 59, credits: 1000, blurb: "Everything you need to run your day with Mila." },
    { key: "pro_plus", name: "Mila Pro+", price_usd: 99, credits: 2500, blurb: "For busy agents and teams: more of everything, plus scheduled social content." },
  ],
  packs: [
    { credits: 500, price_usd: 15 },
    { credits: 1000, price_usd: 27 },
    { credits: 2500, price_usd: 60 },
  ],
  dev_credits: 100000, // effectively unlimited while developing; the ledger still records real usage
};

export const MAX_SOCIAL_POSTS_PER_DAY = 3;
export const BULK_EMAIL_CONFIRM_THRESHOLD = 10; // always confirm sends to more than this many recipients
