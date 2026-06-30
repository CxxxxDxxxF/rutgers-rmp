import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  let userId: string
  try {
    const { data, error } = await db.auth.getUser(token)
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = data.user.id
  } catch (err) {
    log.error('portal: auth error', err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: sub, error: subError } = await db
    .from('user_subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (subError) {
    log.error('portal: subscription lookup failed', subError)
    return NextResponse.json({ error: 'Failed to look up subscription' }, { status: 500 })
  }

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: 'No active subscription found' }, { status: 404 })
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-05-27.dahlia',
    })

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/account`
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: returnUrl,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    log.error('portal: stripe error', err)
    return NextResponse.json({ error: 'Failed to open billing portal' }, { status: 500 })
  }
}
