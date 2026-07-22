import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'
import { checkoutPriceIdForPlan, isCheckoutConfigured, parseCheckoutPlan } from '@/lib/stripe-plans'
import { SITE_URL } from '@/lib/site-url'

const CHECKOUT_PLAN = 'pro'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    configured: isCheckoutConfigured(CHECKOUT_PLAN),
    supportedPlans: [CHECKOUT_PLAN],
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const plan = parseCheckoutPlan((body as { plan?: unknown }).plan)

  if (!plan) {
    return NextResponse.json({ error: 'Unsupported checkout plan' }, { status: 400 })
  }

  const priceId = checkoutPriceIdForPlan(plan)
  if (!process.env.STRIPE_SECRET_KEY || !priceId) {
    return NextResponse.json({ error: 'Stripe price not configured' }, { status: 503 })
  }

  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let user: { id: string; email?: string } | null = null
  try {
    const db = createServiceClient()
    const { data, error } = await db.auth.getUser(token)
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    user = data.user
  } catch (err) {
    log.error('checkout: supabase auth error', err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-05-27.dahlia',
    })

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${SITE_URL}/pro?success=1`,
      cancel_url: `${SITE_URL}/pro`,
      customer_email: user.email,
      metadata: { user_id: user.id },
      subscription_data: {
        metadata: { user_id: user.id },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    log.error('checkout: stripe session error', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
