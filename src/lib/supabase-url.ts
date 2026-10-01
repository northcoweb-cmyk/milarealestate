/** The Supabase project URL, tolerant of common paste mistakes (trailing slash, "/rest/v1/", whitespace). */
export function supabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/(rest|auth|storage)\/v1.*$/i, "").replace(/\/+$/, "");
}
