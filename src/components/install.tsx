"use client";

import { useEffect, useState } from "react";
import { Share, Plus, Download, X } from "lucide-react";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function useInstall() {
  const [deferred, setDeferred] = useState<BIP | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true);
    setPlatform(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : /Android/.test(ua) ? "android" : "desktop");
    // phones and tablets only: a laptop or desktop is never asked to add anything to a home screen
    setMobile(/iPhone|iPod|iPad|Android/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    const h = (e: Event) => { e.preventDefault(); setDeferred(e as BIP); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  return { deferred, standalone, platform, mobile, install: async () => { if (!deferred) return; await deferred.prompt(); setDeferred(null); } };
}

export function InstallSteps({ platform }: { platform: "ios" | "android" | "desktop" }) {
  if (platform === "ios") return <ol className="muted space-y-1.5 text-[14.5px]"><li className="flex items-center gap-2">1. Tap <Share size={16} className="inline" /> <b>Share</b> in Safari</li><li className="flex items-center gap-2">2. Choose <Plus size={16} className="inline" /> <b>Add to Home Screen</b></li><li>3. Tap <b>Add</b> — Mila opens like an app</li></ol>;
  if (platform === "android") return <ol className="muted space-y-1.5 text-[14.5px]"><li>1. Tap the <b>⋮</b> menu in Chrome</li><li>2. Choose <b>Install app</b> (or <b>Add to Home screen</b>)</li></ol>;
  return <p className="muted text-[14.5px]">In Chrome or Edge, click the install icon at the right of the address bar — or open the menu and choose <b>Install Mila</b>.</p>;
}

const SEEN_KEY = "mila_install_seen";

/** Marks the install prompt as shown, so it never nags again (it's always available at the bottom of More). */
export function markInstallSeen() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* storage unavailable */ }
}

/**
 * Shown once, as a popup, the first time someone is signed in on a phone or tablet in the browser (never on a laptop or desktop, never inside the installed app,
 * and never before they have signed in: it lives in the signed-in app shell). After that it does not return; More → "Add to Home Screen" always has the steps.
 */
export function InstallPopup() {
  const { deferred, standalone, platform, mobile, install } = useInstall();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!mobile || standalone) return;
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { /* treat as unseen */ }
    if (seen) return;
    const id = setTimeout(() => { setShow(true); markInstallSeen(); }, 1800); // counts as shown the moment it appears
    return () => clearTimeout(id);
  }, [mobile, standalone]);
  if (!show || !mobile || standalone) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:items-center" role="dialog" aria-modal="true" aria-label="Add Mila to your Home Screen">
      <div className="absolute inset-0 bg-black/40" onClick={() => setShow(false)} />
      <div className="rise relative w-full max-w-sm p-5 text-left shadow-2xl" style={{ borderRadius: 28, background: "var(--surface)", color: "var(--ink)" }}>
        <button className="btn btn-quiet btn-sm absolute right-2 top-2 !px-2" onClick={() => setShow(false)} aria-label="Close"><X size={16} /></button>
        <p className="display text-[34px] leading-none">Mila</p>
        <p className="mt-3 font-semibold">Add Mila to your Home Screen</p>
        <p className="muted mt-1 text-[14px]">She opens like an app, full screen, one tap from your home screen.</p>
        <div className="mt-3"><InstallSteps platform={platform} /></div>
        <div className="mt-4 flex gap-2">
          {deferred && <button className="btn btn-primary flex-1" onClick={async () => { await install(); setShow(false); }}><Download size={16} />Install</button>}
          <button className={"btn flex-1 " + (deferred ? "" : "btn-primary")} onClick={() => setShow(false)}>{deferred ? "Not now" : "Got it"}</button>
        </div>
        <p className="faint mt-3 text-center text-[12.5px]">You can find this later in More.</p>
      </div>
    </div>
  );
}
