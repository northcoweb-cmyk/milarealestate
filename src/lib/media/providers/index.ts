import type { PhotoProvider } from "../types";
import { zillapi } from "./zillapi";
import { rapidapi } from "./rapidapi";

/** Add a provider here (and implement PhotoProvider) - nothing else in the app changes. */
export const PROVIDERS: Record<string, PhotoProvider> = { zillapi, rapidapi };

/**
 * Paid photo providers are OPT-IN: set PHOTO_PROVIDER=zillapi (or rapidapi) AND its key. With nothing set, no provider is ever called
 * (cards use the free Street View photo or the agent's own photos), so a leftover key can never burn credits by itself.
 */
export function activeProvider(): PhotoProvider | null {
  const p = PROVIDERS[providerName()];
  return p && p.configured() ? p : null;
}
export const providerName = () => (process.env.PHOTO_PROVIDER || "none").toLowerCase();
