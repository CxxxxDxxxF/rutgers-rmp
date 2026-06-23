import Link from 'next/link'
import AppHeader from '@/components/AppHeader'

export const metadata = {
  title: 'Privacy Policy | RU Rate',
  description: 'How RU Rate collects, uses, and protects your data.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 pb-24">
        <h1 className="text-3xl font-black text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-zinc-500 mb-10">Last updated: June 23, 2026</p>

        <div className="space-y-8 text-sm text-zinc-300 leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-white mb-3">1. What we collect</h2>
            <ul className="space-y-2 list-disc list-inside text-zinc-400">
              <li><span className="text-zinc-200 font-medium">Account data:</span> Your email address when you create an account via Supabase Auth.</li>
              <li><span className="text-zinc-200 font-medium">Sniper alert data:</span> An email address and/or phone number you optionally provide to receive seat-open notifications. Stored only for alert delivery; never shared.</li>
              <li><span className="text-zinc-200 font-medium">Review data:</span> Reviews you write about professors. These are publicly visible on the professor&apos;s profile. Your account email is not displayed publicly.</li>
              <li><span className="text-zinc-200 font-medium">Payment data:</span> Subscription transactions are processed by Stripe. We never see or store card numbers. We store only your subscription status and Stripe customer ID.</li>
              <li><span className="text-zinc-200 font-medium">Vote fingerprint:</span> A one-way hash of your IP address and device signals, used solely to prevent duplicate review votes. The original IP is not stored.</li>
              <li><span className="text-zinc-200 font-medium">Usage data:</span> Standard server logs (request paths, timestamps) retained briefly for debugging. No tracking pixels or behavioral advertising.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">2. How we use it</h2>
            <ul className="space-y-2 list-disc list-inside text-zinc-400">
              <li>Operate and secure your account.</li>
              <li>Deliver seat-open and seat-closed email/SMS alerts you requested.</li>
              <li>Process and manage your Pro subscription.</li>
              <li>Display your reviews on professor pages.</li>
              <li>Detect duplicate votes to preserve review integrity.</li>
              <li>Debug production errors.</li>
            </ul>
            <p className="mt-3 text-zinc-500">We do not sell your data. We do not use your data for advertising.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">3. Third-party services</h2>
            <p className="text-zinc-400 mb-2">We share data with these processors only to the extent necessary:</p>
            <ul className="space-y-1.5 list-disc list-inside text-zinc-400">
              <li><span className="text-zinc-200 font-medium">Supabase</span> — database and authentication. Your email and review data reside on Supabase-managed infrastructure.</li>
              <li><span className="text-zinc-200 font-medium">Stripe</span> — payment processing. Governed by <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">Stripe&apos;s Privacy Policy</a>.</li>
              <li><span className="text-zinc-200 font-medium">Resend</span> — transactional email delivery for sniper alerts.</li>
              <li><span className="text-zinc-200 font-medium">Twilio</span> — SMS delivery for sniper alerts.</li>
              <li><span className="text-zinc-200 font-medium">Railway</span> — cloud hosting provider.</li>
              <li><span className="text-zinc-200 font-medium">RateMyProfessors</span> — professor quality data displayed on this site is sourced from RateMyProfessors. We do not control or warrant that data.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">4. Data retention</h2>
            <ul className="space-y-2 list-disc list-inside text-zinc-400">
              <li>Account data is retained until you delete your account.</li>
              <li>Sniper alert contact info is removed when you delete that watchlist entry.</li>
              <li>Reviews persist until you delete them or we remove them per our Terms of Service.</li>
              <li>Subscription records are retained as required by applicable law (typically 7 years for financial records).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">5. Your rights</h2>
            <p className="text-zinc-400">You may request deletion of your account and associated data at any time by emailing <a href="mailto:obvcjgaming@gmail.com" className="underline hover:text-white">obvcjgaming@gmail.com</a>. We will process deletion requests within 30 days. Reviews you have written can be deleted by you directly from the professor page.</p>
            <p className="mt-2 text-zinc-400">California residents may exercise CCPA rights (know, delete, opt-out of sale) via the same contact. We do not sell personal information.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">6. Security</h2>
            <p className="text-zinc-400">We use Supabase row-level security, HTTPS everywhere, and Stripe for payment handling. No system is perfectly secure. In the event of a breach affecting your personal data we will notify you by email within 72 hours of discovery.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">7. Children</h2>
            <p className="text-zinc-400">This service is intended for college students aged 18 and older. We do not knowingly collect data from anyone under 13. If you believe a minor has created an account, contact us and we will delete it.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">8. Changes</h2>
            <p className="text-zinc-400">Material changes will be posted on this page with an updated date. Continued use after 30 days constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">9. Contact</h2>
            <p className="text-zinc-400">Questions or requests: <a href="mailto:obvcjgaming@gmail.com" className="underline hover:text-white">obvcjgaming@gmail.com</a></p>
          </section>

        </div>

        <div className="mt-12 pt-6 border-t border-zinc-800 flex gap-4 text-xs text-zinc-600">
          <Link href="/terms" className="hover:text-zinc-400 transition-colors">Terms of Service</Link>
          <Link href="/" className="hover:text-zinc-400 transition-colors">← Back to RU Rate</Link>
        </div>
      </main>
    </div>
  )
}
