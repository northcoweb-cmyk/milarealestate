import type { PhotoProvider } from "../types";
import { zillapi } from "./zillapi";
import { rapidapi } from "./rapidapi";

/** Add a provider here (and implement PhotoProvider) - nothing else in the app changes. */
export const PROVIDERS: Record<string, PhotoProvider> = { zillapi, rapidapi };

/** PHOTO_PROVIDER=zillapi (default) | rapidapi. Returns null when the chosen provider has no key (photos then fall back to placeholders). */
export function activeProvider(): PhotoProvider | null {
  const p = PROVIDERS[(process.env.PHOTO_PROVIDER || "zillapi").toLowerCase()];
  return p && p.configured() ? p : null;
}
export const providerName = () => (process.env.PHOTO_PROVIDER || "zillapi").toLowerCase();
