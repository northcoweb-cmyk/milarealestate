/** Simplified service marks for the Connections screen. Inline SVG, no network, same look in light and dark. */
export function ServiceLogo({ id, size = 40 }: { id: string; size?: number }) {
  const box = { width: size, height: size, borderRadius: size * 0.28, background: "#fff", display: "grid", placeItems: "center", boxShadow: "0 1px 0 rgba(0,0,0,.04), 0 0 0 1px rgba(0,0,0,.07)", flexShrink: 0 } as const;
  const s = size * 0.62;
  const mark = (() => {
    switch (id) {
      case "google_gmail": return (
        <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden><path fill="#4285F4" d="M6 40h8V22.5L3 14.3v21.7A4 4 0 0 0 6 40z"/><path fill="#34A853" d="M34 40h8a4 4 0 0 0 3-4V14.3L34 22.5z"/><path fill="#FBBC04" d="M34 12.5v10l11-8.2v-3.1c0-3-3.4-4.8-5.8-3z"/><path fill="#EA4335" d="M14 22.5v-10l10 7.5 10-7.5v10L24 30z"/><path fill="#C5221F" d="M3 11.2v3.1l11 8.2v-10L8.8 8.6C6.4 6.8 3 8.5 3 11.2z"/></svg>);
      case "outlook": return (
        <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden><rect x="14" y="9" width="30" height="30" rx="4" fill="#28A8EA"/><path d="M14 17l15 9 15-9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round"/><rect x="3" y="13" width="23" height="22" rx="4" fill="#0364B8"/><ellipse cx="14.5" cy="24" rx="5.2" ry="6.3" fill="none" stroke="#fff" strokeWidth="2.6"/></svg>);
      case "google_calendar": return (
        <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden><rect x="6" y="6" width="36" height="36" rx="5" fill="#fff" stroke="#4285F4" strokeWidth="3"/><rect x="6" y="6" width="36" height="10" rx="4" fill="#4285F4"/><text x="24" y="35" textAnchor="middle" fontSize="17" fontWeight="700" fill="#4285F4" fontFamily="Arial,sans-serif">31</text></svg>);
      case "apple_calendar": return (
        <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden><rect x="6" y="6" width="36" height="36" rx="8" fill="#fff" stroke="#d1d1d6" strokeWidth="2"/><rect x="6" y="6" width="36" height="12" rx="6" fill="#ff3b30"/><rect x="6" y="12" width="36" height="6" fill="#ff3b30"/><text x="24" y="37" textAnchor="middle" fontSize="18" fontWeight="600" fill="#1c1c1e" fontFamily="Arial,sans-serif">8</text></svg>);
      case "google_contacts": return (
        <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden><rect x="5" y="5" width="38" height="38" rx="8" fill="#4285F4"/><circle cx="24" cy="19" r="6.5" fill="#fff"/><path d="M11.5 38c1.5-7 6-9.5 12.5-9.5S35 31 36.500 38z" fill="#fff"/></svg>);
      case "google_sheets": return (
        <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden><path d="M12 4h17l11 11v26a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" fill="#0F9D58"/><path d="M29 4l11 11H32a3 3 0 0 1-3-3z" fill="#87CEAC"/><path d="M15 23h18v13H15zm2 2v3h6v-3zm8 0v3h6v-3zm-8 5v4h6v-4zm8 0v4h6v-4z" fill="#fff" fillRule="evenodd"/></svg>);
      case "google_g": return (
        <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>);
      case "apple": return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden><path fill="#111" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>);
      case "mls": return (
        <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden><path d="M6 22L24 7l18 15v18a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill="#7B63E8"/><rect x="19" y="27" width="10" height="16" rx="2" fill="#fff"/></svg>);
      default: return <span style={{ fontSize: s * 0.7 }}>🔌</span>;
    }
  })();
  return <span style={box}>{mark}</span>;
}
