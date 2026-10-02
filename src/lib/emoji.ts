/** One place that decides which emoji stands for which kind of item, so lists read at a glance. */
export const EVENT_EMOJI: Record<string, string> = { open_house: "🏠", showing: "🏠", call: "📞", meeting: "👥", lunch: "🍽️", closing: "🔑", other: "📌" };
export const TASK_EMOJI: Record<string, string> = { approval: "✋", follow_up: "💬", reminder: "⏰", task: "📝", event: "📅", document: "📄", communication: "✉️" };
export const APPROVAL_EMOJI: Record<string, string> = { send_email: "✉️", send_bulk_email: "✉️", send_sms: "💬", publish_social: "📣", calendar_create: "📅", calendar_change: "📅", calendar_cancel: "📅", send_document: "📄", delete: "🗑️", other: "✋" };
export const CONTACT_EMOJI: Record<string, string> = { buyer: "🔍", seller: "🏷️", rental: "🏢", investor: "💼", past_client: "⭐", lead: "🌱", vendor: "🛠️", agent: "🤝", other: "👤" };
export const PLATFORM_EMOJI: Record<string, string> = { instagram: "📸", facebook: "👍", tiktok: "🎵", linkedin: "💼", x: "🐦" };

export const eventEmoji = (kind: string | null | undefined) => EVENT_EMOJI[kind ?? "other"] ?? "📌";
export const taskEmoji = (kind: string | null | undefined) => TASK_EMOJI[kind ?? "task"] ?? "📝";
export const approvalEmoji = (action: string | null | undefined) => APPROVAL_EMOJI[action ?? "other"] ?? "✋";
export const contactEmoji = (type: string | null | undefined) => CONTACT_EMOJI[type ?? "other"] ?? "👤";
export const platformEmoji = (p: string | null | undefined) => PLATFORM_EMOJI[p ?? ""] ?? "📣";

/** Colour per kind of contact, so buyers/sellers/etc. are obvious at a glance (bg is a soft tint of fg). */
export const TYPE_COLOR: Record<string, string> = { buyer: "#1f9d6b", seller: "#e5772b", rental: "#0f9aa8", investor: "#c79a14", past_client: "#d6456f", lead: "#8b8b92", vendor: "#a0764f", agent: "#5f6368", other: "#8b8b92" };
export const typeColor = (t: string | null | undefined) => TYPE_COLOR[t ?? "other"] ?? TYPE_COLOR.other;
