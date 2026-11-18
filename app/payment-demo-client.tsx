"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bell, Check, CheckCircle2, ChevronRight, CreditCard, LoaderCircle, RotateCcw, ShieldCheck, Wallet, XCircle } from "lucide-react";

const methods = { gcash: "GCash", maya: "Maya", card: "Card" } as const;
type Method = keyof typeof methods;
type Step = "reminder" | "checkout" | "approval" | "pending" | "paid" | "failed";

// A browser-only illustration: no account data, payment API, notification
// permission, storage write or change to a real rental record is involved.
export default function PaymentDemoClient() {
  const [step, setStep] = useState<Step>("reminder");
  const [method, setMethod] = useState<Method>("gcash");
  const outcome = useRef<"paid" | "failed">("paid");
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  const stage = step === "reminder" ? 0 : ["checkout", "approval"].includes(step) ? 1 : 2;

  useEffect(() => { if (mounted.current) heading.current?.focus(); else mounted.current = true; }, [step]);
  useEffect(() => {
    if (step !== "pending") return;
    const timer = window.setTimeout(() => setStep(outcome.current), 1400);
    return () => window.clearTimeout(timer);
  }, [step]);

  function simulate(result: "paid" | "failed") { outcome.current = result; setStep("pending"); }
  function restart() { setMethod("gcash"); setStep("reminder"); }

  return <div className="payment-demo-experience">
    <ol className="payment-demo-progress" aria-label="Demo steps">
      {["Reminder", "Payment", "Confirmation"].map((label, index) => <li key={label} aria-current={stage === index ? "step" : undefined} className={stage === index ? "current" : stage > index ? "completed" : ""}><span>{stage > index ? <Check size={13} /> : index + 1}</span>{label}{index < 2 && <ChevronRight size={14} aria-hidden="true" />}</li>)}
    </ol>
    <section className="payment-demo-card" aria-label="Interactive payment preview">
      <div className="payment-demo-card-top"><span><ShieldCheck size={14} />DEMO ONLY</span><small>No money moves</small></div>
      <div className="payment-demo-card-body">
        {step === "reminder" && <>
          <div className="payment-demo-symbol"><Bell size={26} /></div>
          <p className="eyebrow">A little nudge, right on time</p>
          <h2 ref={heading} tabIndex={-1}>Your rent bill is ready.</h2>
          <p className="payment-demo-description">Imagine this reminder on your phone. One tap opens the bill you need to pay.</p>
          <button className="payment-demo-notification" onClick={() => setStep("checkout")} aria-label="Open demo rent payment from the example reminder">
            <span className="payment-demo-notification-icon"><Bell size={20} /></span><span><strong>Malapit <small>Example reminder</small></strong><span>You have a rent bill ready.</span><small>Tap to open your payment page.</small></span><ChevronRight size={18} />
          </button>
          <p className="payment-demo-small">This is an on-screen example. It does not send a push notification or turn notifications on.</p>
        </>}
        {step === "checkout" && <>
          <button className="payment-demo-back text-button" onClick={() => setStep("reminder")}><ArrowLeft size={15} />Back to reminder</button>
          <p className="eyebrow">Sample Apartments · Room 2B</p>
          <h2 ref={heading} tabIndex={-1}>Everything is filled in.</h2>
          <p className="payment-demo-description">Check the bill, choose how to pay, and continue.</p>
          <div className="payment-demo-amount"><span>Sample rent for November 2026</span><strong>₱8,000.00</strong><small>Fictional bill · no charge</small></div>
          <dl className="payment-demo-bill"><div><dt>Property owner</dt><dd>Demo Owner</dd></div><div><dt>Covered dates</dt><dd>Nov 1–30, 2026</dd></div><div><dt>Due date</dt><dd>Nov 30, 2026</dd></div></dl>
          <fieldset className="payment-demo-methods"><legend>Choose a demo payment method</legend><div>{(Object.keys(methods) as Method[]).map(value => <button key={value} type="button" aria-pressed={method === value} onClick={() => setMethod(value)}>{value === "card" ? <CreditCard size={19} /> : <Wallet size={19} />}<span>{methods[value]}</span>{method === value && <CheckCircle2 size={16} className="payment-demo-method-check" />}</button>)}</div></fieldset>
          <p className="payment-demo-small">These options are illustrations. Live methods and any fees depend on the approved provider and owner setup.</p>
          <button className="button primary payment-demo-main-action" onClick={() => setStep("approval")}>Continue with {methods[method]} · demo<ArrowRight size={17} /></button>
        </>}
        {step === "approval" && <>
          <button className="payment-demo-back text-button" onClick={() => setStep("checkout")}><ArrowLeft size={15} />Back to payment methods</button>
          <div className="payment-demo-symbol">{method === "card" ? <CreditCard size={26} /> : <Wallet size={26} />}</div>
          <p className="eyebrow">{methods[method]} · demo approval</p>
          <h2 ref={heading} tabIndex={-1}>You approve the payment.</h2>
          <p className="payment-demo-description">With a provider connected, this step would happen in its secure checkout. This demo does not open a wallet or ask for card details.</p>
          <div className="payment-demo-amount"><span>Fictional payment to Demo Owner</span><strong>₱8,000.00</strong><small>Nothing will be charged</small></div>
          <button className="button primary payment-demo-main-action" onClick={() => simulate("paid")}>Approve demo payment<Check size={17} /></button>
          <button className="payment-demo-alternative text-button" onClick={() => simulate("failed")}>Try a failed demo payment</button>
        </>}
        {step === "pending" && <div className="payment-demo-result" role="status" aria-live="polite">
          <div className="payment-demo-symbol"><LoaderCircle className="spin" size={27} /></div>
          <h2 ref={heading} tabIndex={-1}>Checking the demo payment…</h2>
          <p className="payment-demo-description">A real bill would update after a verified confirmation from the provider. This wait is simulated.</p>
        </div>}
        {step === "paid" && <div className="payment-demo-result" role="status" aria-live="polite">
          <div className="payment-demo-symbol payment-demo-symbol-success"><CheckCircle2 size={30} /></div>
          <p className="eyebrow">No reference to type. No owner approval step.</p>
          <h2 ref={heading} tabIndex={-1}>Demo payment confirmed.</h2>
          <p className="payment-demo-description">This shows the proposed result for a payment confirmed by a connected provider. No real payment was made.</p>
          <dl className="payment-demo-receipt"><div><dt>Sample amount</dt><dd>₱8,000.00</dd></div><div><dt>Demo method</dt><dd>{methods[method]}</dd></div><div><dt>Sample bill balance</dt><dd>₱0.00 · demo only</dd></div><div><dt>Bank payout</dt><dd>Not sent · demo only</dd></div></dl>
          <details className="payment-demo-owner"><summary>What would the owner see?</summary><p>Payment confirmed for Room 2B, with the amount and method recorded automatically. The provider’s payout status would be shown separately.</p></details>
          <p className="payment-demo-small">Your real bills and balances have not changed. This page stores no payment record.</p>
          <button className="button secondary payment-demo-main-action" onClick={restart}><RotateCcw size={16} />Try the demo again</button>
        </div>}
        {step === "failed" && <div className="payment-demo-result" role="status" aria-live="polite">
          <div className="payment-demo-symbol payment-demo-symbol-failed"><XCircle size={30} /></div>
          <p className="eyebrow">Failed payment example</p>
          <h2 ref={heading} tabIndex={-1}>The demo payment did not go through.</h2>
          <p className="payment-demo-description">The sample bill stays unpaid. With a connected provider, you could check the result and try again or choose another method.</p>
          <div className="payment-demo-amount"><span>Sample remaining balance</span><strong>₱8,000.00</strong><small>No real money was moved</small></div>
          <button className="button primary payment-demo-main-action" onClick={() => setStep("checkout")}>Try another demo method<ArrowRight size={17} /></button>
          <button className="payment-demo-alternative text-button" onClick={restart}>Start over</button>
        </div>}
      </div>
    </section>
  </div>;
}
