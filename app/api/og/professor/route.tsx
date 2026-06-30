import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

const VERDICT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  take:    { bg: 'rgba(34,197,94,0.18)',  text: '#22c55e', label: 'TAKE' },
  depends: { bg: 'rgba(245,158,11,0.18)', text: '#f59e0b', label: 'DEPENDS' },
  avoid:   { bg: 'rgba(239,68,68,0.18)',  text: '#ef4444', label: 'AVOID' },
}

function ratingColor(r: number) {
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const name    = searchParams.get('name')    ?? 'Professor'
  const ratingS = searchParams.get('rating')
  const verdict = searchParams.get('verdict') ?? null
  const dept    = searchParams.get('dept')    ?? 'Rutgers University'
  const numS    = searchParams.get('num')     ?? '0'

  const rating    = ratingS ? parseFloat(ratingS) : null
  const numRatings = parseInt(numS) || 0
  const vc        = verdict && VERDICT_COLORS[verdict] ? VERDICT_COLORS[verdict] : null
  const rc        = rating != null ? ratingColor(rating) : '#71717a'

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          background: '#09080A',
          padding: '60px 80px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Scarlet radial bloom */}
        <div
          style={{
            position: 'absolute',
            top: -120,
            left: -120,
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(204,0,51,0.18) 0%, transparent 70%)',
          }}
        />

        {/* RU Rate branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #CC0033 0%, #990026 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: 'white', fontSize: 22, fontWeight: 900 }}>R</span>
          </div>
          <span style={{ color: 'white', fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em' }}>
            <span style={{ color: '#CC0033' }}>RU</span> Rate
          </span>
        </div>

        {/* Main content */}
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
          {/* Verdict badge */}
          {vc && (
            <div style={{ display: 'flex' }}>
              <div
                style={{
                  background: vc.bg,
                  border: `1.5px solid ${vc.text}50`,
                  borderRadius: 8,
                  padding: '6px 14px',
                  fontSize: 16,
                  fontWeight: 800,
                  color: vc.text,
                  letterSpacing: '0.08em',
                }}
              >
                {vc.label}
              </div>
            </div>
          )}

          {/* Professor name */}
          <div
            style={{
              fontSize: name.length > 24 ? 56 : 72,
              fontWeight: 900,
              color: 'white',
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
            }}
          >
            {name}
          </div>

          {/* Department */}
          <div style={{ fontSize: 24, color: '#71717a', fontWeight: 500 }}>{dept}</div>

          {/* Stats row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 32, marginTop: 8 }}>
            {rating != null && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 64, fontWeight: 900, color: rc, lineHeight: 1 }}>
                  {rating.toFixed(1)}
                </span>
                <span style={{ fontSize: 22, color: '#52525b', fontWeight: 600 }}>/5</span>
              </div>
            )}

            {numRatings > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: '#a1a1aa' }}>
                  {numRatings.toLocaleString()}
                </span>
                <span style={{ fontSize: 14, color: '#52525b' }}>RMP ratings</span>
              </div>
            )}

            {rating == null && (
              <span style={{ fontSize: 28, color: '#52525b', fontWeight: 500 }}>
                No rating yet
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            paddingTop: 20,
            marginTop: 16,
          }}
        >
          <span style={{ fontSize: 16, color: '#3f3f46' }}>rurate-web-production.up.railway.app</span>
          <span style={{ fontSize: 16, color: '#3f3f46' }}>Rutgers University · New Brunswick</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
