import Link from 'next/link'
import AppHeader from '@/components/AppHeader'

export const metadata = {
  title: 'Terms of Service | RU Rate',
  description: 'Terms and conditions for using RU Rate.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 pb-24">
        <h1 className="text-3xl font-black text-white mb-2">Terms of Service</h1>
        <p className="text-sm text-zinc-500 mb-10">Last updated: June 23, 2026</p>

        <div className="space-y-8 text-sm text-zinc-300 leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-white mb-3">1. About RU Rate</h2>
            <p className="text-zinc-400">RU Rate is an independent student tool for searching Rutgers University courses, reading professor reviews, and tracking course section availability. <span className="text-white font-medium">RU Rate is not affiliated with, endorsed by, or connected to Rutgers University in any way.</span> &quot;Rutgers&quot; is a registered trademark of Rutgers University; use of the name is purely descriptive of the courses and professors this tool helps students research.</p>
            <p className="mt-2 text-zinc-400">RU Rate does not auto-register for classes, does not interact with WebReg, and never requests your Rutgers NetID or password.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">2. User-generated reviews</h2>
            <p className="text-zinc-400 mb-2">By submitting a review you agree that:</p>
            <ul className="space-y-2 list-disc list-inside text-zinc-400">
              <li>Your review reflects your <span className="text-white font-medium">honest, personal experience</span> with the professor.</li>
              <li>You will not submit false, misleading, defamatory, harassing, or discriminatory statements.</li>
              <li>You will not post private personal information about any individual.</li>
              <li>You grant RU Rate a non-exclusive, royalty-free license to display your review on the platform.</li>
              <li>You are solely responsible for the content of your review. RU Rate is not liable for user-submitted content.</li>
            </ul>
            <p className="mt-3 text-zinc-400">We reserve the right to remove reviews that violate these terms or applicable law without notice. To report a review, email <a href="mailto:obvcjgaming@gmail.com" className="underline hover:text-white">obvcjgaming@gmail.com</a>.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">3. RateMyProfessors data</h2>
            <p className="text-zinc-400">Professor quality ratings displayed on professor profile pages are sourced from <a href="https://www.ratemyprofessors.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">RateMyProfessors</a>, a third-party service. This data is provided for informational purposes only. RU Rate does not guarantee its accuracy, completeness, or timeliness. RateMyProfessors data is subject to <a href="https://www.ratemyprofessors.com/legal/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">their terms of service</a>.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">4. Course section sniper</h2>
            <p className="text-zinc-400">The sniper monitors publicly available Rutgers Schedule of Classes data. Seat availability shown in RU Rate may lag behind WebReg. <span className="text-white font-medium">Always verify in WebReg before acting on any seat-open notification.</span> RU Rate is not responsible for missed enrollment opportunities due to notification delays, worker downtime, or inaccurate data.</p>
            <p className="mt-2 text-zinc-400">By providing a phone number or email for sniper alerts you consent to receive transactional notifications about courses you have explicitly chosen to watch. You may stop alerts at any time by removing the section from your watchlist.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">5. Pro subscription</h2>
            <ul className="space-y-2 list-disc list-inside text-zinc-400">
              <li>Pro subscriptions are billed monthly via Stripe.</li>
              <li>You may cancel at any time; your Pro access continues until the end of the current billing period.</li>
              <li>We do not offer refunds for partial billing periods unless required by applicable law.</li>
              <li>We reserve the right to change pricing with 30 days&apos; notice to subscribers.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">6. Acceptable use</h2>
            <p className="text-zinc-400 mb-2">You agree not to:</p>
            <ul className="space-y-2 list-disc list-inside text-zinc-400">
              <li>Scrape, crawl, or systematically extract data from RU Rate.</li>
              <li>Attempt to circumvent rate limits, authentication, or security measures.</li>
              <li>Use RU Rate for any unlawful purpose.</li>
              <li>Interfere with or disrupt the service or its infrastructure.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">7. Disclaimer of warranties</h2>
            <p className="text-zinc-400">RU Rate is provided &quot;as is&quot; without warranties of any kind, express or implied. We do not warrant that the service will be uninterrupted, error-free, or that course and professor data will be accurate or current.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">8. Limitation of liability</h2>
            <p className="text-zinc-400">To the maximum extent permitted by law, RU Rate and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the service, including but not limited to missed course registration, reliance on inaccurate data, or any content posted by other users.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">9. DMCA / intellectual property</h2>
            <p className="text-zinc-400">If you believe content on RU Rate infringes your copyright, send a notice to <a href="mailto:obvcjgaming@gmail.com" className="underline hover:text-white">obvcjgaming@gmail.com</a> including: identification of the work, location of the infringing content, your contact information, and a statement of good-faith belief. We will respond promptly.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">10. Governing law</h2>
            <p className="text-zinc-400">These terms are governed by the laws of the State of New Jersey, without regard to conflict of law principles. Any disputes shall be resolved in the courts of New Jersey.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">11. Changes</h2>
            <p className="text-zinc-400">We may update these terms. Material changes will be posted here with an updated date. Continued use after 30 days constitutes acceptance of the new terms.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">12. Contact</h2>
            <p className="text-zinc-400">Questions: <a href="mailto:obvcjgaming@gmail.com" className="underline hover:text-white">obvcjgaming@gmail.com</a></p>
          </section>

        </div>

        <div className="mt-12 pt-6 border-t border-zinc-800 flex gap-4 text-xs text-zinc-600">
          <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy Policy</Link>
          <Link href="/" className="hover:text-zinc-400 transition-colors">← Back to RU Rate</Link>
        </div>
      </main>
    </div>
  )
}
