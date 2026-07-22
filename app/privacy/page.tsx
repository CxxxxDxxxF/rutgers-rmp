import Link from 'next/link'
import AppHeader from '@/components/AppHeader'

export const metadata = {
  title: 'Privacy Policy — RU Rate',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 pb-24">
        <h1 className="text-3xl font-black text-white mb-2">Privacy Policy</h1>
        <p className="text-xs text-zinc-500 mb-8">Last updated: June 23, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-zinc-300">

          <section>
            <h2 className="text-base font-bold text-white mb-3">1. Overview</h2>
            <p>
              RU Rate (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;the service&rdquo;) is a course-search and registration-preparation tool
              for Rutgers University students. This policy explains what data we collect, why we
              collect it, how long we keep it, and what rights you have. We are not affiliated with
              Rutgers University.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">2. Data We Collect</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-zinc-200 mb-1">Account data</h3>
                <p>
                  When you sign up we collect your email address through Supabase Auth (managed by
                  Supabase, Inc.). We do not store passwords — authentication is handled via
                  Supabase&apos;s secure session system. Your email is used only to identify your account
                  and send transactional alerts you explicitly request.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-200 mb-1">Course-sniper watchlist</h3>
                <p>
                  Section index numbers (index numbers only — no course content or personal
                  schedules) you add to your watchlist are stored in our database linked to your
                  account. We poll the Rutgers Schedule of Classes on your behalf and send you an
                  alert when a seat opens. We never log your NetID or access WebReg on your behalf.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-200 mb-1">Course-sniper email alerts</h3>
                <p>
                  Course Sniper uses the email address associated with your authenticated account
                  to deliver seat-open notifications through Resend. You cannot set a separate
                  alert recipient. We do not sell or share your email address with third parties.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-200 mb-1">Subscription and billing</h3>
                <p>
                  Pro subscriptions are processed by Stripe, Inc. We never see or store your full
                  card number, CVV, or bank details. We store a Stripe customer ID and subscription
                  status in our database so we can gate Pro features. Stripe&apos;s own privacy policy
                  governs payment data.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-200 mb-1">Vote fingerprints</h3>
                <p>
                  When you vote on a professor review, a one-way HMAC hash of your IP address and
                  a server-side salt is stored to prevent duplicate votes. The raw IP address is
                  never stored or logged.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-200 mb-1">Usage and logs</h3>
                <p>
                  Our hosting provider (Railway) retains standard HTTP access logs (timestamps,
                  paths, status codes) for up to 30 days. We do not add additional user-level
                  analytics or tracking pixels.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-200 mb-1">Third-party professor data</h3>
                <p>
                  Professor ratings displayed on this site are sourced from RateMyProfessors
                  (operated by Chegg, Inc.). We cache this data in our database to reduce latency.
                  We do not sell or redistribute RMP data.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">3. How We Use Your Data</h2>
            <ul className="list-disc list-inside space-y-1 text-zinc-300">
              <li>Authenticate you and maintain your session</li>
              <li>Send seat-open notifications for sections you are watching</li>
              <li>Process and manage Pro subscription payments through Stripe</li>
              <li>Prevent duplicate votes on professor reviews</li>
              <li>Improve the service (aggregate, anonymised usage patterns only)</li>
            </ul>
            <p className="mt-3">We do not use your data for advertising, profiling, or sale to third parties.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">4. Data Retention</h2>
            <ul className="list-disc list-inside space-y-1 text-zinc-300">
              <li>Account data: retained until you delete your account</li>
              <li>Watchlist entries: deleted when you remove them or delete your account</li>
              <li>Account email and watchlist alert data: deleted when you delete your account</li>
              <li>Subscription records: retained for up to 7 years for tax/legal compliance after cancellation</li>
              <li>Vote fingerprints: retained indefinitely in hashed form (no personal data recoverable)</li>
              <li>Server access logs: up to 30 days (Railway policy)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">5. Your Rights</h2>
            <p className="mb-3">
              Depending on your jurisdiction (including the EU/EEA under GDPR and California under
              CCPA) you may have the right to:
            </p>
            <ul className="list-disc list-inside space-y-1 text-zinc-300">
              <li>Access the personal data we hold about you</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data (&ldquo;right to be forgotten&rdquo;)</li>
              <li>Object to or restrict certain processing</li>
              <li>Data portability</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email us at{' '}
              <a href="mailto:obvcjgaming@gmail.com" className="text-zinc-200 underline underline-offset-2 hover:text-white">
                obvcjgaming@gmail.com
              </a>
              . You can also delete your account directly from{' '}
              <Link href="/account" className="text-zinc-200 underline underline-offset-2 hover:text-white">
                Settings
              </Link>
              , which immediately removes your account and personal data.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">6. Third-Party Services</h2>
            <ul className="list-disc list-inside space-y-1 text-zinc-300">
              <li><strong className="text-zinc-200">Supabase</strong> — database and authentication (supabase.com/privacy)</li>
              <li><strong className="text-zinc-200">Stripe</strong> — payment processing (stripe.com/privacy)</li>
              <li><strong className="text-zinc-200">Resend</strong> — transactional email (resend.com/legal/privacy-policy)</li>
              <li><strong className="text-zinc-200">Railway</strong> — hosting and infrastructure (railway.com/legal/privacy)</li>
              <li><strong className="text-zinc-200">RateMyProfessors / Chegg</strong> — professor rating data (chegg.com/privacy)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">7. Cookies and Local Storage</h2>
            <p>
              We use browser session cookies solely for authentication (set by Supabase Auth).
              We do not use advertising cookies. Watchlist data may be stored in your browser&apos;s
              local storage as a performance optimisation; this data never leaves your device
              unless you are signed in, in which case it is synced to your account.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">8. Children</h2>
            <p>
              RU Rate is intended for college students aged 18 and older. We do not knowingly
              collect personal data from anyone under 13. If you believe a minor has provided us
              data, please contact us and we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this policy from time to time. Material changes will be noted at the
              top of this page with a revised date. Continued use of the service after changes
              constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">10. Contact</h2>
            <p>
              Questions or requests:{' '}
              <a href="mailto:obvcjgaming@gmail.com" className="text-zinc-200 underline underline-offset-2 hover:text-white">
                obvcjgaming@gmail.com
              </a>
            </p>
          </section>

        </div>

        <div className="mt-10 pt-6 border-t border-[var(--border)] flex gap-4 text-xs text-zinc-600">
          <Link href="/terms" className="hover:text-zinc-400 transition-colors">Terms of Service</Link>
          <Link href="/" className="hover:text-zinc-400 transition-colors">Home</Link>
        </div>
      </main>
    </div>
  )
}
