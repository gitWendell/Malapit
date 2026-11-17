import type { Metadata } from "next";
import { Logo } from "../ui";

export const metadata: Metadata = { title: "How to use Malapit", description: "A short video and simple steps for finding rentals, connecting owners and renters, creating bills and recording payments." };
const steps = [
  ["Find a place", "Use the map, location search and filters to compare nearby homes. Save a home or send the lister an inquiry about a viewing. Homes marked Example home are fictional."],
  ["Advertise a property", "Owners use List your place to submit a public listing, its location, photos and costs. It goes through review before appearing publicly. Keep its availability current."],
  ["Add a private rental", "In My Rentals, add the unit or room you manage. Enter its agreed rent, due day and rental dates. Adding this private record does not advertise it on the map."],
  ["Connect the renter", "Invite the renter’s Google sign-in email, then copy and share the invitation link yourself. The renter reviews the details and accepts in their account. Invitations expire after seven days. Accepting does not sign a lease or authorize a charge."],
  ["Create a rent bill", "Open the connected rental and choose Create rent bill. Check the billing month, covered dates, rent amount and due date. Both accounts see the same private bill."],
  ["Report a payment", "Pay the owner directly using your agreed method. Open the bill, choose Report a payment, and enter the amount, date, method and reference. The report waits for the owner to check it; it does not reduce the balance yet."],
  ["Confirm receipt", "The owner checks their original cash, bank or wallet records, then confirms receipt or requests a correction. Only confirmed records reduce the balance. Owners can also record payments they have already received."],
  ["Keep a clear history", "Partial payments leave the remainder visible. Corrections keep the original record and a reason. A reversal corrects Malapit’s record; it does not return money. Use Get app for home-screen installation steps on your phone."],
];
export default function GuidePage() {
  return <div className="guide-page">
    <header className="guide-header"><a href="/" aria-label="Malapit home"><Logo /></a><a className="text-link" href="/">Back to the map ↗</a></header>
    <main className="guide-main"><div className="guide-intro"><p className="eyebrow">A little help getting started</p><h1>Your quick guide to Malapit.</h1><p>Find a rental, connect with your owner or renter, and keep your rent records together.</p></div>
      <div className="guide-content"><section className="guide-video-section" aria-label="Video walkthrough">
        <video controls playsInline preload="metadata" poster="/tutorial/malapit-how-to-poster.jpg" aria-label="Malapit walkthrough with English narration and captions"><source src="/tutorial/malapit-how-to.mp4" type="video/mp4" /><track kind="captions" src="/tutorial/malapit-how-to.vtt" srcLang="en" label="English" />Your browser cannot play this video. <a href="/tutorial/malapit-how-to.mp4">Download the walkthrough</a>.</video>
        <p>The walkthrough uses fictional demo data and computer narration. No money was transferred.</p><a className="text-link" href="/tutorial/malapit-how-to.mp4" download>Download the video ↓</a><p><a className="text-link" href="/tutorial/malapit-how-to-transcript.txt">Read the video transcript ↗</a></p>
      </section><section className="guide-steps" aria-label="Written guide">{steps.map(([title, description], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><h2>{title}</h2><p>{description}</p></div></article>)}</section></div>
      <div className="guide-reminder"><strong>Payment records, with a clear difference.</strong><p>Malapit records what the owner confirms. It does not collect, hold, transfer or independently verify money. Keep your original receipts and check any difference directly with the other party.</p><a className="button primary" href="/?view=rentals">Open My Rentals ↗</a></div>
    </main><footer className="guide-footer"><a href="/privacy">Privacy notice</a><a href="/terms">Terms of use</a><a href="mailto:casulwendell12@gmail.com">Get help</a></footer>
  </div>;
}
