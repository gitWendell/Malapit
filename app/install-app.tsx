"use client";
import { useEffect, useState } from "react";
import { ArrowDownToLine, Check, Copy, Smartphone } from "lucide-react";
import { Modal } from "./ui";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [open, setOpen] = useState(false), [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [copyFallback, setCopyFallback] = useState(false);
  useEffect(() => {
    const mode = window.matchMedia("(display-mode: standalone)");
    const checkMode = () => setInstalled(mode.matches);
    const offer = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setOpen(false); setPrompt(null); };
    checkMode();
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", complete);
    mode.addEventListener("change", checkMode);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then(() => console.info("Malapit offline help is ready."))
        .catch(() => console.warn("Malapit offline help could not be enabled in this browser."));
    }
    return () => { window.removeEventListener("beforeinstallprompt", offer); window.removeEventListener("appinstalled", complete); mode.removeEventListener("change", checkMode); };
  }, []);
  async function install() {
    if (!prompt || busy) return;
    setBusy(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setPrompt(null);
      if (choice.outcome === "accepted") setOpen(false);
    } catch { setPrompt(null); }
    finally { setBusy(false); }
  }
  const siteUrl = typeof window !== "undefined" && !["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? window.location.origin + "/" : "https://malapit-rentals-ph.curvedbugle.chatgpt.site/";
  async function copyLink() {
    try { await navigator.clipboard.writeText(siteUrl); setCopied(true); }
    catch { setCopyFallback(true); }
  }
  if (installed) return null;
  return <>
    <button className="install-app-link" aria-label="Get the Malapit app" onClick={() => { setOpen(true); setCopied(false); }}><Smartphone size={18} /><span>Get the app</span></button>
    {open && <Modal title="Take Malapit with you" onClose={() => setOpen(false)} className="install-modal">
      <div className="install-content">
        <img className="install-app-icon" src="/icons/icon-192.png" width={76} height={76} alt="Malapit app icon" />
        <h3>A little closer, on your phone.</h3>
        <p>Add Malapit to your home screen for easy access to rentals, saved homes, and your inquiries.</p>
        {prompt ? <button className="button primary full-width" disabled={busy} onClick={install}><ArrowDownToLine size={18} />{busy ? "Opening install…" : "Install Malapit"}</button>
          : <div className="install-steps"><strong>On Android</strong><ol><li>Open Malapit in <b>Chrome</b>.</li><li>Tap the <b>⋮</b> menu, then <b>Add to home screen</b>.</li><li>Choose <b>Install</b> or <b>Add</b> if Chrome offers it.</li></ol><p>Already installed? Open Malapit from your home screen.</p></div>}
        <button className="button secondary full-width" onClick={copyLink}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "Link copied" : "Copy link for my phone"}</button>
        {copied && <p className="install-copy-status" role="status">Malapit link copied.</p>}
        {copyFallback && <label className="field"><span>Copy this link</span><input readOnly value={siteUrl} onFocus={event => event.currentTarget.select()} /></label>}
        <p className="install-note">An internet connection is needed for current listings, maps, and messages. Sign in with the account that has access to this site.</p>
      </div>
    </Modal>}
  </>;
}
