/** The normalized shape the rest of the app consumes. Nothing outside src/lib/media/providers knows a provider's response format. */
export interface MediaPhoto { url: string; thumbUrl?: string; width: number | null; height: number | null; caption: string | null; sortOrder: number }
export type PhotoStatus = "ok" | "unavailable" | "pending" | "limited";

export interface ListingMedia {
  listingId: string | null;
  propertyId: string | null;
  providerPropertyId: string | null;
  source: string; // provider key
  photos: MediaPhoto[];
  photoCount: number;
  photoStatus: PhotoStatus;
  fetchedAt: string | null;
  expiresAt: string | null;
  cached: boolean;
}

/** What we know about a home, strongest identifiers first. */
export interface MediaQuery {
  providerPropertyId?: string | null; // e.g. ZPID
  listingId?: string | null;
  propertyId?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

export class ProviderError extends Error {
  constructor(public code: "auth" | "credits" | "rate" | "not_found" | "network" | "bad_response" | "mismatch", message: string) { super(message); }
}

export interface ProviderPhotos { providerPropertyId: string; photos: MediaPhoto[]; requests: { endpoint: string; units: number }[] }

export interface PhotoProvider {
  readonly key: string;
  configured(): boolean;
  /** Estimated USD per provider "unit" (credit / request) - owner-configurable via env. */
  readonly unitCostUsd: number;
  /** Resolve the home (by provider id when we have one, else by address, VERIFYING the match) and return its photos. */
  fetchPhotos(q: MediaQuery): Promise<ProviderPhotos>;
}
