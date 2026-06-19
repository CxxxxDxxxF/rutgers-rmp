export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-05-27.dahlia',
  })

  const body = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    log.error('webhook: signature verification failed', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const db = createServiceClient()

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.user_id
      const email = session.customer_email ?? undefined
      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id
      const customerId = typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id

      if (userId) {
        const { error } = await db.from('user_subscriptions').upsert(
          {
            user_id: userId,
            email: email ?? null,
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id: subscriptionId ?? null,
            status: 'active',
          },
          { onConflict: 'user_id', ignoreDuplicates: false }
        )
        if (error) log.error('webhook: upsert checkout.session.completed', error)
      }
    } else if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription
      const { error } = await db
        .from('user_subscriptions')
        .update({
          status: sub.status,
          stripe_price_id: sub.items.data[0]?.price.id ?? null,
          current_period_end: new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
        })
        .eq('stripe_subscription_id', sub.id)
      if (error) log.error('webhook: update customer.subscription.updated', error)
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription
      const { error } = await db
        .from('user_subscriptions')
        .update({ status: 'canceled' })
        .eq('stripe_subscription_id', sub.id)
      if (error) log.error('webhook: update customer.subscription.deleted', error)
    }
  } catch (err) {
    log.error('webhook: handler error', err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
