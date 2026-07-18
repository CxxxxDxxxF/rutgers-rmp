import Link from 'next/link'
import AppHeader from '@/components/AppHeader'

export const metadata = {
  title: 'Terms of Service — RU Rate',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 pb-24">
        <h1 className="text-3xl font-black text-white mb-2">Terms of Service</h1>
        <p className="text-xs text-zinc-500 mb-8">Last updated: June 23, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-zinc-300">

          <section>
            <h2 className="text-base font-bold text-white mb-3">1. Agreement</h2>
            <p>
              By accessing or using RU Rate (&ldquo;the service&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;) you agree to these
              Terms of Service. If you do not agree, do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">2. Not Affiliated with Rutgers</h2>
            <p>
              RU Rate is an independent student tool. It is not affiliated with, endorsed by, or
              operated by Rutgers, The State University of New Jersey. &ldquo;Rutgers&rdquo; and related
              names are trademarks of Rutgers University. Course and section data is sourced from
              the publicly available Rutgers Schedule of Classes API.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">3. Permitted Use</h2>
            <p>You may use RU Rate to:</p>
            <ul className="list-disc list-inside space-y-1 mt-2 text-zinc-300">
              <li>Search and filter course offerings</li>
              <li>View professor ratings and reviews sourced from RateMyProfessors</li>
              <li>Monitor sections for seat availability</li>
              <li>Compare and rank schedules</li>
            </ul>
            <p className="mt-3">You may not:</p>
            <ul className="list-disc list-inside space-y-1 mt-2 text-zinc-300">
              <li>Scrape, crawl, or bulk-download data from this service</li>
              <li>Use the service for any automated registration or WebReg interaction</li>
              <li>Attempt to circumvent rate limits, access controls, or authentication</li>
              <li>Redistribute professor rating data sourced from RateMyProfessors</li>
              <li>Use the service in any way that violates applicable law</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">4. What This Service Does Not Do</h2>
            <p>
              RU Rate is a decision-support tool only. It does <strong className="text-zinc-200">not</strong>:
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2 text-zinc-300">
              <li>Register you for any course or section</li>
              <li>Access or interact with Rutgers WebReg on your behalf</li>
              <li>Store or request your NetID or Rutgers password</li>
              <li>Guarantee seat availability or successful registration</li>
            </ul>
            <p className="mt-3">
              Seat-open alerts are delivered on a best-effort basis. Alert delivery depends on
              polling frequency, third-party infrastructure (Resend, Twilio), and network
              conditions. We do not guarantee that an alert will reach you before a seat is
              taken.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">5. Professor Reviews and Ratings</h2>
            <p>
              Professor ratings and reviews displayed on RU Rate are sourced from
              RateMyProfessors, operated by Chegg, Inc. We cache this data to improve
              performance. We do not independently verify the accuracy of reviews and make no
              warranties about their correctness.
            </p>
            <p className="mt-3">
              If you submit a vote or review through this service, you represent that it is your
              honest, first-hand opinion. Do not submit false, misleading, or defamatory content.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">6. Pro Subscriptions</h2>
            <p>
              Pro is a paid subscription billed monthly through Stripe. By subscribing you authorise
              recurring charges at the rate displayed at checkout. You may cancel at any time via
              the billing portal; access continues until the end of the current billing period.
              We do not offer refunds for partial billing periods unless required by applicable law.
            </p>
            <p className="mt-3">
              We reserve the right to change Pro pricing or features with reasonable notice.
              Material changes will be communicated by email to active subscribers.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">7. Account Termination</h2>
            <p>
              You may delete your account at any time from{' '}
              <Link href="/account" className="text-zinc-200 underline underline-offset-2 hover:text-white">
                Settings
              </Link>
              . We may suspend or terminate accounts that violate these terms, engage in abuse, or
              as required by law. Active Pro subscriptions will be cancelled upon account deletion.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">8. Intellectual Property</h2>
            <p>
              The RU Rate name, logo, and original code are owned by the service operator.
              Professor data sourced from RateMyProfessors remains the property of Chegg, Inc.
              Course data is sourced from the public Rutgers SOC API.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">9. Disclaimers and Limitation of Liability</h2>
            <p>
              The service is provided &ldquo;as is&rdquo; without warranty of any kind. We are not liable
              for missed registration deadlines, missed seats, or any academic or financial
              consequences arising from use of or reliance on this service. Our total liability
              for any claim arising from use of the service is limited to the amount you paid us
              in the three months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">10. Governing Law</h2>
            <p>
              These terms are governed by the laws of the State of New Jersey, without regard to
              its conflict-of-law provisions. Any disputes shall be resolved in the courts of
              Middlesex County, New Jersey.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">11. Changes to These Terms</h2>
            <p>
              We may update these terms from time to time. Material changes will be noted with a
              revised date at the top of this page. Continued use of the service after changes
              constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">12. Contact</h2>
            <p>
              Questions:{' '}
              <a href="mailto:obvcjgaming@gmail.com" className="text-zinc-200 underline underline-offset-2 hover:text-white">
                obvcjgaming@gmail.com
              </a>
            </p>
          </section>

        </div>

        <div className="mt-10 pt-6 border-t border-[var(--border)] flex gap-4 text-xs text-zinc-600">
          <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy Policy</Link>
          <Link href="/" className="hover:text-zinc-400 transition-colors">Home</Link>
        </div>
      </main>
    </div>
  )
}
