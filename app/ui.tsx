"use client";
import { useEffect, useId, useRef } from "react";
import { X, ArrowUpRight, MapPin } from "lucide-react";
import type { ReactNode } from "react";
export function Logo() {
  return <span className="brand"><svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="20" fill="#fff0f3"/><path d="M15 43V29c0-8 14-8 14 0v14m0-14c0-8 15-8 15 0v14" fill="none" stroke="#ce405a" strokeWidth="5" strokeLinecap="round"/><circle cx="49" cy="16" r="5" fill="#f6b383"/></svg><span>malapit</span></span>;
}
export function Modal({ title, children, onClose, wide = false, className = "" }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { dialog?.close(); document.body.style.overflow = previous; }; }, []);
  return <dialog ref={ref} aria-labelledby={id} className={`modal ${wide ? "modal-wide" : ""} ${className}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === ref.current) onClose(); }}>
    <div className="modal-top"><h2 id={id}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>
    {children}
  </dialog>;
}
export function Empty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><MapPin size={30} strokeWidth={1.4} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function SignIn({ onClose }: { onClose: () => void }) {
  return <Modal title="Sign in to Malapit" onClose={onClose}><div className="signin-content"><Logo /><p>Sign in to save homes, message owners, and list your place.</p><a className="button primary" href={`/auth/signin?return_to=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : "/")}`} target="_top">Continue to sign in<ArrowUpRight size={18} /></a><span>Your testing account keeps your homes and conversations together.</span></div></Modal>;
}
