import type { Metadata } from "next";
import { Logo } from "../ui";

export const metadata: Metadata = { title: "How to use Malapit", description: "A short video and simple steps for finding rentals, connecting owners and renters, creating bills and recording payments." };
const tutorialAsset = (suffix: string) => "/tutorial/malapit-how-to" + suffix + "?v=motion-2";
const steps = [
  ["Find a place", "Use the map, location search and filters to compare nearby homes. Save a home or send the lister an inquiry about a viewing. Homes marked Example home are fictional."],
  ["Advertise a property", "Owners use List your place to submit a public listing, its location, photos and costs. It goes through review before appearing publicly. Keep its availability current."],
  ["Add a private rental", "In My Rentals, add the unit or room you manage. Enter its agreed rent, due day and rental dates. Adding this private record does not advertise it on the map."],
  ["Connect the renter", "Invite the renter’s Google sign-in email, then copy and share the invitation link yourself. The renter reviews the details and accepts in their account. Invitations expire after seven days. Accepting does not sign a lease or authorize a charge."],
  ["Set up your bills", "Open the connected rental. Use Create rent bill for a bill you check yourself, or Set up monthly bills for an agreed calendar-month cycle. Review the rent and first full month before turning it on. Partial months need a manual bill. You can pause future bills; closing the connection stops them. This never deducts money."],
  ["Share the bill", "Both accounts see the same private bill. Owners can use Copy bill message to share the amount and a link themselves. The link requires the correct account to sign in; Malapit does not send a message for you."],
  ["Report a payment", "Pay the owner directly using your agreed method. In I’m renting, choose Report a payment. The remaining amount, today’s date and your last confirmed method are filled in. Check them, enter a new reference when needed, and confirm you already paid. Use Change amount, method or date for a partial payment or different details. Your report waits for the owner’s check."],
  ["Confirm receipt in one place", "Owners see reports from their units in Payments to check. Check your original cash, bank or wallet records, then confirm receipt or request a correction with a reason. Only confirmed records reduce the balance. Owners can also record payments they have already received."],
  ["Keep a clear history", "Partial payments leave the remainder visible. Corrections keep the original record and a reason. A reversal corrects Malapit’s record; it does not return money. Use Get app for home-screen installation steps on your phone."],
];
export default function GuidePage() {
  return <div className="guide-page">
    <header className="guide-header"><a href="/" aria-label="Malapit home"><Logo /></a><a className="text-link" href="/">Back to the map ↗</a></header>
    <main className="guide-main"><div className="guide-intro"><p className="eyebrow">A little help getting started</p><h1>Your quick guide to Malapit.</h1><p>Find a rental, connect with your owner or renter, and keep your rent records together.</p></div>
      <div className="guide-content"><section className="guide-video-section" aria-label="Video walkthrough">
        <video controls playsInline preload="metadata" poster={tutorialAsset("-poster.jpg")} aria-label="Animated Malapit walkthrough with English narration and captions"><source src={tutorialAsset(".mp4")} type="video/mp4" /><track kind="captions" src={tutorialAsset(".vtt")} srcLang="en" label="English" /><track kind="chapters" src={tutorialAsset("-chapters.vtt")} srcLang="en" label="Guide sections" />Your browser cannot play this video. <a href={tutorialAsset(".mp4")}>Download the walkthrough</a>.</video>
        <p>Follow the clicks and typing in this animated demo of the manual workflow. The written steps also cover the new billing and payment shortcuts. The example data is fictional and the narration is synthetic. No money was transferred.</p><a className="text-link" href={tutorialAsset(".mp4")} download>Download the video ↓</a><p><a className="text-link" href={tutorialAsset("-transcript.txt")}>Read the video transcript ↗</a></p>
      </section><section className="guide-steps" aria-label="Written guide">{steps.map(([title, description], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><h2>{title}</h2><p>{description}</p></div></article>)}</section></div>
      <div className="guide-reminder"><strong>Payment records, with a clear difference.</strong><p>Malapit records what the owner confirms. It does not collect, hold, transfer or independently verify money. Keep your original receipts and check any difference directly with the other party.</p><a className="button primary" href="/?view=rentals">Open My Rentals ↗</a></div>
    </main><footer className="guide-footer"><a href="/privacy">Privacy notice</a><a href="/terms">Terms of use</a><a href="mailto:casulwendell12@gmail.com">Get help</a></footer>
  </div>;
}
