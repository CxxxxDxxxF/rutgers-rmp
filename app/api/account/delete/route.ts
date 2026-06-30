import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest) {
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
    log.error('account/delete: auth error', err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Cancel Stripe subscription if one exists
  if (process.env.STRIPE_SECRET_KEY) {
    const { data: sub } = await db
      .from('user_subscriptions')
      .select('stripe_subscription_id, status')
      .eq('user_id', userId)
      .maybeSingle()

    if (sub?.stripe_subscription_id && sub.status === 'active') {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
          apiVersion: '2026-05-27.dahlia',
        })
        await stripe.subscriptions.cancel(sub.stripe_subscription_id)
      } catch (err) {
        log.error('account/delete: stripe cancel error', err)
        // Non-fatal — continue with account deletion
      }
    }
  }

  // Delete subscription record
  await db.from('user_subscriptions').delete().eq('user_id', userId)

  // Delete the Supabase auth account (must be last)
  const { error: deleteError } = await db.auth.admin.deleteUser(userId)
  if (deleteError) {
    log.error('account/delete: deleteUser error', deleteError)
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
