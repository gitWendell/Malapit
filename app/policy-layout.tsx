import type { ReactNode } from "react";
import { Logo } from "./ui";
import { RELEASE_LABEL } from "../lib/release";

export default function PolicyLayout({ title, intro, children, updated="November 17, 2026" }: { title: string; intro: string; children: ReactNode; updated?:string }) {
  return <div className="policy-shell">
    <header className="policy-header"><a href="/" aria-label="Malapit home"><Logo /></a><a className="text-link" href="/">Back to rentals <span aria-hidden="true">↗</span></a></header>
    <main className="policy-main">
      <div className="policy-intro"><p className="eyebrow">Malapit / Philippines</p><h1>{title}</h1><p>{intro}</p><span>Updated {updated} · {RELEASE_LABEL}</span></div>
      <article className="policy-content">{children}</article>
    </main>
    <footer className="policy-footer"><span>Find a place that feels close.</span><nav aria-label="Website information"><a href="/guide">How to use Malapit</a><a href="/privacy">Privacy notice</a><a href="/terms">Terms of use</a><a href="mailto:casulwendell12@gmail.com">Contact</a></nav></footer>
  </div>;
}
