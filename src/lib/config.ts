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
    content_plan: 6,
    document_analysis: 5,
    image_analysis: 3,
    image_generation: 10,
    market_research: 10,
    property_lookup: 3,
    property_prep: 5,
    new_listings: 2,
    contact_import_base: 1,
    contact_import_per_25: 1,
    workflow_open_house: 4,
    workflow_default: 2,
    voice_transcription: 1,
  },
  // ai_budget_usd is the hard monthly ceiling on what a subscriber may cost us in AI (about a quarter of the price at most).
  plans: [
    { key: "solo", name: "Mila Solo", price_usd: 79, credits: 1500, ai_budget_usd: 18, blurb: "Your AI operations manager for a one-agent business." },
    { key: "pro", name: "Mila Pro", price_usd: 129, credits: 3500, ai_budget_usd: 32, blurb: "For producing agents: more of everything, deeper automation, scheduled content." },
    { key: "team", name: "Mila Team", price_usd: 299, credits: 12000, ai_budget_usd: 85, blurb: "For teams and small brokerages: shared pipeline and far more room to work." },
  ],
  packs: [
    { credits: 500, price_usd: 15 },
    { credits: 1000, price_usd: 27 },
    { credits: 2500, price_usd: 60 },
  ],
  trial: { days: 7, credits: 400, ai_budget_usd: 3 }, // 7 days, no card: enough to rely on it, capped so a trial can never cost more than ~$3
  dev_credits: 600, // sized for a ~$2 AI test budget (about $0.003 of real cost per credit); the ledger records real usage either way
};

export const MAX_SOCIAL_POSTS_PER_DAY = 3;
export const BULK_EMAIL_CONFIRM_THRESHOLD = 10; // always confirm sends to more than this many recipients
