import type { Metadata } from "next";
import { Logo } from "../ui";
import { GuideVideo } from "../guide-video";
import chapters from "../../public/tutorial/malapit-how-to-index.json";

export const metadata: Metadata = { title: "How to use Malapit", description: "A short video and simple steps for finding rentals, connecting owners and renters, creating bills and recording payments." };
const tutorialVersion = "motion-3";
const tutorialAsset = (suffix: string) => "/tutorial/malapit-how-to" + suffix + "?v=" + tutorialVersion;
const steps = [
  ["Find a place", "Use the map, location search and filters to compare nearby homes. Save a home or send the lister an inquiry about a viewing. Homes marked Example home are fictional."],
  ["Advertise a property", "Choose List your place and enter the rent. Pick the province, city or municipality, and barangay. Drag the property pin to the entrance or tap the correct spot on the map; no coordinates are needed. Add your photos and costs, then submit for review. Keep the listing’s availability current."],
  ["Add a private rental", "In My Rentals, add the unit or room you manage. Enter its agreed rent, due day and rental dates. Adding this private record does not advertise it on the map."],
  ["Connect the renter", "Invite the renter’s Google sign-in email, then copy and share the invitation link yourself. The renter reviews the details and accepts in their account. Invitations expire after seven days. Accepting does not sign a lease or authorize a charge."],
  ["Set up your bills", "Open the connected rental. Use Create rent bill for a bill you check yourself, or Set up monthly bills for an agreed calendar-month cycle. Review the rent and first full month before turning it on. Partial months need a manual bill. You can pause future bills; closing the connection stops them. This never deducts money."],
  ["Share the bill", "Both accounts see the same private bill. Owners can use Copy bill message to share the amount and a link themselves. The link requires the correct account to sign in; Malapit does not send a message for you."],
  ["Pay the owner directly", "Direct payment stays available. Pay the owner by your agreed bank, wallet or cash method. In I’m renting, choose Report a payment. The remaining amount, today’s date and your last confirmed method are filled in. Check them, enter a new reference when needed, and confirm you already paid. Use Change amount, method or date for a partial payment or different details. Your report waits for the owner’s check."],
  ["Confirm receipt in one place", "Owners see reports from their units in Payments to check. Check your original cash, bank or wallet records, then confirm receipt or request a correction with a reason. Only confirmed records reduce the balance. Owners can also record payments they have already received."],
  ["Keep a clear history", "Partial payments leave the remainder visible. Corrections keep the original record and a reason. A reversal corrects Malapit’s record; it does not return money. Use Get app for home-screen installation steps on your phone."],
  ["Check your monthly owner report", "In My Rentals, choose Reports and a billing month. Compare totals across your units, or choose View unit to focus on one. Download the unit summary, bill records or payment history as a CSV file that opens in Excel. Downloads include all matching pages, cancelled records and corrections. These totals use the latest records for the selected bills, including payments made in other months."],
  ["Preview online checkout", "Try the separate payment demo to see a proposed reminder and checkout. It uses a fictional bill and simulated approval. It does not charge you, pay an owner, send a phone notification or change your rent records. Real online checkout is not available yet."],
];
export default function GuidePage() {
  return <div className="guide-page">
    <header className="guide-header"><a href="/" aria-label="Malapit home"><Logo /></a><a className="text-link" href="/">Back to the map ↗</a></header>
    <main className="guide-main"><div className="guide-intro"><p className="eyebrow">A little help getting started</p><h1>Your quick guide to Malapit.</h1><p>Find a rental, connect with your owner or renter, and keep your rent records together.</p></div>
      <div className="guide-content"><section className="guide-video-section" aria-label="Video walkthrough">
        <GuideVideo chapters={chapters} assetVersion={tutorialVersion} />
        <p>Follow the clicks and typing through 14 short sections, including monthly bills, direct payments and the owner’s review list. Online checkout and phone reminders are preview only. The example data is fictional and the narration is synthetic. No real money was moved.</p><a className="text-link" href={tutorialAsset(".mp4")} download>Download the video ↓</a><p><a className="text-link" href={tutorialAsset("-transcript.txt")}>Read the video transcript ↗</a></p>
      </section><section className="guide-steps" aria-label="Written guide">{steps.map(([title, description], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><h2>{title}</h2><p>{description}</p></div></article>)}</section></div>
      <a className="text-link payment-demo-guide-link" href="/payment-demo">Try the future payment flow · demo only ↗</a>
      <div className="guide-reminder"><strong>Payment records, with a clear difference.</strong><p>Malapit records what the owner confirms. It does not collect, hold, transfer or independently verify money. Keep your original receipts and check any difference directly with the other party.</p><a className="button primary" href="/?view=rentals">Open My Rentals ↗</a></div>
    </main><footer className="guide-footer"><a href="/privacy">Privacy notice</a><a href="/terms">Terms of use</a><a href="mailto:casulwendell12@gmail.com">Get help</a></footer>
  </div>;
}
