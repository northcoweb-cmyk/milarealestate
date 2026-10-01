"use client";

import { useEffect, useState } from "react";
import { Share, Plus, Download, X } from "lucide-react";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function useInstall() {
  const [deferred, setDeferred] = useState<BIP | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  useEffect(() => {
    const ua = navigator.userAgent;
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true);
    setPlatform(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : /Android/.test(ua) ? "android" : "desktop");
    const h = (e: Event) => { e.preventDefault(); setDeferred(e as BIP); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  return { deferred, standalone, platform, install: async () => { if (!deferred) return; await deferred.prompt(); setDeferred(null); } };
}

export function InstallSteps({ platform }: { platform: "ios" | "android" | "desktop" }) {
  if (platform === "ios") return <ol className="muted space-y-1.5 text-[14.5px]"><li className="flex items-center gap-2">1. Tap <Share size={16} className="inline" /> <b>Share</b> in Safari</li><li className="flex items-center gap-2">2. Choose <Plus size={16} className="inline" /> <b>Add to Home Screen</b></li><li>3. Tap <b>Add</b> — Mila opens like an app</li></ol>;
  if (platform === "android") return <ol className="muted space-y-1.5 text-[14.5px]"><li>1. Tap the <b>⋮</b> menu in Chrome</li><li>2. Choose <b>Install app</b> (or <b>Add to Home screen</b>)</li></ol>;
  return <p className="muted text-[14.5px]">In Chrome or Edge, click the install icon at the right of the address bar — or open the menu and choose <b>Install Mila</b>.</p>;
}

export function InstallBanner() {
  const { deferred, standalone, platform, install } = useInstall();
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem("mila_install_dismissed") === "1"); } catch { setHidden(false); } }, []);
  if (standalone || hidden) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem("mila_install_dismissed", "1"); } catch { /* ignore */ } };
  return (
    <div className="glass rise relative mx-auto w-full max-w-xl px-5 py-4 text-left" style={{ borderRadius: 24 }}>
      <button className="btn btn-quiet btn-sm absolute right-2 top-2 !px-2" onClick={dismiss} aria-label="Dismiss"><X size={16} /></button>
      <p className="font-semibold">Add Mila to your Home Screen for the full experience.</p>
      {open ? <div className="mt-2"><InstallSteps platform={platform} /></div> : (
        <div className="mt-2 flex gap-2">
          {deferred ? <button className="btn btn-primary btn-sm" onClick={install}><Download size={16} />Install</button> : <button className="btn btn-sm" onClick={() => setOpen(true)}>Show me how</button>}
        </div>
      )}
    </div>
  );
}
