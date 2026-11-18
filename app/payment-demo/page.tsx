import type { Metadata } from "next";
import { ArrowRight, Bell, CheckCircle2, Wallet } from "lucide-react";
import { Logo } from "../ui";
import PaymentDemoClient from "../payment-demo-client";

export const metadata: Metadata = {
  title: "Payment flow demo · Malapit",
  description: "Try a fictional rent reminder and payment flow. This browser-only demo makes no charge, sends no notification and changes no rental records.",
  robots: { index: false, follow: false },
};

export default function PaymentDemoPage() {
  return <div className="payment-demo-page">
    <header className="payment-demo-header"><a href="/" aria-label="Malapit home"><Logo /></a><a className="text-link" href="/guide">How to use Malapit ↗</a></header>
    <main className="payment-demo-main">
      <div className="payment-demo-intro"><p className="eyebrow">A preview of what’s next</p><h1>A shorter way<br /> to pay rent.</h1><p>From a reminder to a payment confirmation, with your bill already filled in.</p><div className="payment-demo-disclosure"><strong>Try it with a fictional bill.</strong><p>This is an interactive demo, not a connected checkout. No account, money, card details or notification permission is needed.</p></div>
        <ol className="payment-demo-benefits"><li><Bell size={20} /><div><strong>A reminder that opens the right bill</strong><p>Proposed phone reminders would be optional. Tap one to go straight to your private payment page.</p></div></li><li><Wallet size={20} /><div><strong>Check the amount and choose a method</strong><p>The bill and property owner would already be filled in. You approve payment in the provider’s checkout.</p></div></li><li><CheckCircle2 size={20} /><div><strong>A confirmation for both people</strong><p>Payments confirmed by the provider could update the balance automatically. Bank payouts would be tracked separately.</p></div></li></ol>
        <a className="text-link payment-demo-current-link" href="/?view=rentals">Open your current rental records<ArrowRight size={15} /></a>
      </div>
      <PaymentDemoClient />
    </main>
    <footer className="payment-demo-footer"><p>Online rent collection and phone reminders are not active. Current payment records still require the owner’s receipt check.</p><nav aria-label="Website information"><a href="/guide">How to use</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav></footer>
  </div>;
}
