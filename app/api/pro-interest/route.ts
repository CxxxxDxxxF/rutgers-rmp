import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function POST(req: NextRequest) {
  let body: {
    email?: string
    phone?: string
    plan?: string
    use_case?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = sanitizeEmail(body.email)
  const phone = sanitizePhone(body.phone)
  const plan = sanitizePlan(body.plan)
  const useCase = sanitizeUseCase(body.use_case)

  if (!email && !phone) {
    return NextResponse.json({ error: 'Email or phone required' }, { status: 400 })
  }

  try {
    const db = createServiceClient()
    const { error } = await db
      .from('pro_interest')
      .insert({
        email,
        phone_e164: phone,
        plan,
        use_case: useCase,
      })

    if (error) {
      log.error('Pro interest insert error:', error)
      return NextResponse.json({ error: 'Failed to save interest' }, { status: 500 })
    }

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    log.error('Pro interest POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function sanitizeEmail(value: string | undefined) {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (!email) return null
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null
}

function sanitizePhone(value: string | undefined) {
  if (typeof value !== 'string') return null
  const digits = value.replace(/\D/g, '')
  if (!digits) return null
  const e164 = value.trim().startsWith('+')
    ? `+${digits}`
    : digits.length === 10
      ? `+1${digits}`
      : `+${digits}`
  return /^\+[1-9][0-9]{7,14}$/.test(e164) ? e164 : null
}

function sanitizePlan(value: string | undefined) {
  if (value === 'pro' || value === 'club') return value
  return 'pro'
}

function sanitizeUseCase(value: string | undefined) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, 500) : null
}
