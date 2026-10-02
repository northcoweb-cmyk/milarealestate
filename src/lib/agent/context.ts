import type { Store } from "../db/store";
import type { ConversationState, Profile } from "../types";

/** Everything a tool or handler needs for one agent turn. */
export interface Ctx {
  userId: string;
  profile: Profile;
  store: Store;
  now: Date;
  tz: string;
  conversationId: string;
  state: ConversationState;
  /** collects status lines shown while Mila works */
  steps: string[];
  /** accounting accumulated during the turn */
  usage: { aiCalls: number; creditsKey: string; extraCredits: number };
}

export type ToolResult<T = any> =
  | { ok: true; data: T }
  | { ok: false; code: "not_connected" | "invalid" | "not_found" | "failed" | "coming_soon"; message: string; integration?: string };

export const ok = <T>(data: T): ToolResult<T> => ({ ok: true, data });
export const fail = (code: Exclude<ToolResult, { ok: true }>["code"], message: string, integration?: string): ToolResult<never> => ({ ok: false, code, message, integration });

export const AVATAR_COLORS = ["#2a2a2c", "#3a3a3d", "#4a4a4d", "#5a5a5e", "#1c1c1e", "#333336", "#444447", "#555558"];
export const pickColor = (s: string) => AVATAR_COLORS[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

export const money = (n: number | null | undefined) => (n == null ? "" : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 2 : 0).replace(/0$/, "")}M` : `$${Math.round(n / 1000)}k`);
export const fullMoney = (n: number) => `$${n.toLocaleString("en-US")}`;
export const plural = (n: number, w: string, p = w + "s") => `${n} ${n === 1 ? w : p}`;
export const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;
export const label = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
