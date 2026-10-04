/** Hosts a photo provider is allowed to hand us. Keep tight: the image proxy fetches whatever passes this check. */
const HOSTS = [/(^|\.)zillowstatic\.com$/i, /(^|\.)rdcpix\.com$/i];
export const isListingImageHost = (h: string) => HOSTS.some((re) => re.test(h));
export const proxiedImage = (u: string) => `/api/media/image?u=${encodeURIComponent(u)}`;

/** Same-origin Street View photo of a saved home (the server fetches it from Google and keeps the key private). Square, for posts. */
export const streetViewPostUrl = (propertyId: string) => `/api/properties/${propertyId}/streetview?size=640x640`;
export const isStreetViewPostUrl = (v: string) => /^\/api\/properties\/[\w-]{8,64}\/streetview\?size=\d{3}x\d{3}$/.test(v);
