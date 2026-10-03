/** Turns Google's error into plain steps the owner can follow. */
export function googleHint(name: string, status: string, message: string): string | null {
  const m = `${status} ${message}`;
  if (/not authorized to use this API|has not been used|is not enabled|SERVICE_DISABLED|API_NOT_ACTIVATED|PERMISSION_DENIED.*(disabled|blocked)/i.test(m)) return `Turn on “${name}” for this key: Google Cloud Console → APIs & Services → Library → search “${name}” → Enable.`;
  if (/referer|referrer/i.test(m)) return "This key only works from certain websites. The app calls Google from the server, so set the key's “Application restrictions” to None and use “API restrictions” to limit which APIs it can call.";
  if (/IP address|ip restriction/i.test(m)) return "This key is limited to certain IP addresses. Vercel's addresses change, so set “Application restrictions” to None.";
  if (/billing/i.test(m)) return "Turn on billing for the Google Cloud project (Maps Platform requires it and includes a monthly free credit).";
  if (/key (is )?not valid|invalid key|API key not valid|INVALID_REQUEST.*key/i.test(m)) return "Google says this key isn't valid. Copy it again from Google Cloud into Vercel as GOOGLE_MAPS_API_KEY and redeploy.";
  if (/OVER_QUERY_LIMIT|quota|RESOURCE_EXHAUSTED/i.test(m)) return "The key has hit its usage limit. Raise the quota in Google Cloud or wait for it to reset.";
  return null;
}
