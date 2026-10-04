/** Hosts a photo provider is allowed to hand us. Keep tight: the image proxy fetches whatever passes this check. */
const HOSTS = [/(^|\.)zillowstatic\.com$/i, /(^|\.)rdcpix\.com$/i];
export const isListingImageHost = (h: string) => HOSTS.some((re) => re.test(h));
export const proxiedImage = (u: string) => `/api/media/image?u=${encodeURIComponent(u)}`;
