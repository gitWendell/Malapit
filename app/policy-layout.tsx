import type { ReactNode } from "react";
import { Logo } from "./ui";

export default function PolicyLayout({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <div className="policy-shell">
    <header className="policy-header"><a href="/" aria-label="Malapit home"><Logo /></a><a className="text-link" href="/">Back to rentals <span aria-hidden="true">↗</span></a></header>
    <main className="policy-main">
      <div className="policy-intro"><p className="eyebrow">Malapit / Philippines</p><h1>{title}</h1><p>{intro}</p><span>Updated November 12, 2026 · Testing version</span></div>
      <article className="policy-content">{children}</article>
    </main>
    <footer className="policy-footer"><span>Find a place that feels close.</span><nav aria-label="Website information"><a href="/privacy">Privacy notice</a><a href="/terms">Terms of use</a><a href="mailto:casulwendell12@gmail.com">Contact</a></nav></footer>
  </div>;
}
