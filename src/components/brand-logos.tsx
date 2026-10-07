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
      case "google_contacts": return (
        <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden><rect x="5" y="5" width="38" height="38" rx="8" fill="#4285F4"/><circle cx="24" cy="19" r="6.5" fill="#fff"/><path d="M11.5 38c1.5-7 6-9.5 12.5-9.5S35 31 36.500 38z" fill="#fff"/></svg>);
      case "google_sheets": return (
        <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden><path d="M12 4h17l11 11v26a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" fill="#0F9D58"/><path d="M29 4l11 11H32a3 3 0 0 1-3-3z" fill="#87CEAC"/><path d="M15 23h18v13H15zm2 2v3h6v-3zm8 0v3h6v-3zm-8 5v4h6v-4zm8 0v4h6v-4z" fill="#fff" fillRule="evenodd"/></svg>);
      case "mls": return (
        <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden><path d="M6 22L24 7l18 15v18a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill="#7B63E8"/><rect x="19" y="27" width="10" height="16" rx="2" fill="#fff"/></svg>);
      default: return <span style={{ fontSize: s * 0.7 }}>🔌</span>;
    }
  })();
  return <span style={box}>{mark}</span>;
}
