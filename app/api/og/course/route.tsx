import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

function ratingColor(r: number) {
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const courseNumber = searchParams.get('num')    ?? 'Course'
  const name         = searchParams.get('name')   ?? ''
  const credits      = searchParams.get('credits')
  const deptCode     = searchParams.get('dept')   ?? null
  const openCount    = parseInt(searchParams.get('open') ?? '') || 0
  const totalSections = parseInt(searchParams.get('total') ?? '') || 0
  const profName     = searchParams.get('prof')   ?? null
  const profRatingS  = searchParams.get('prating')
  const profRating   = profRatingS ? parseFloat(profRatingS) : null

  const hasOpen   = openCount > 0
  const hasSects  = totalSections > 0
  const statusColor = hasOpen ? '#22c55e' : hasSects ? '#ef4444' : '#52525b'
  const statusLabel = hasOpen
    ? `${openCount} open section${openCount !== 1 ? 's' : ''}`
    : hasSects ? 'All sections full' : null

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          background: '#09080A',
          padding: '56px 80px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Scarlet bloom — bottom right */}
        <div
          style={{
            position: 'absolute',
            bottom: -100,
            right: -100,
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(204,0,51,0.14) 0%, transparent 70%)',
          }}
        />

        {/* RU Rate branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #CC0033 0%, #990026 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: 'white', fontSize: 20, fontWeight: 900 }}>R</span>
          </div>
          <span style={{ color: 'white', fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em' }}>
            <span style={{ color: '#CC0033' }}>RU</span> Rate
          </span>
          {deptCode && (
            <div
              style={{
                marginLeft: 12,
                background: 'rgba(204,0,51,0.12)',
                border: '1px solid rgba(204,0,51,0.3)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 14,
                fontWeight: 700,
                color: '#ff4d6d',
              }}
            >
              {deptCode}
            </div>
          )}
        </div>

        {/* Course number */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 900,
            color: '#CC0033',
            letterSpacing: '-0.02em',
            lineHeight: 1,
            marginBottom: 16,
          }}
        >
          {courseNumber}
        </div>

        {/* Course name */}
        <div
          style={{
            fontSize: name.length > 50 ? 36 : name.length > 35 ? 42 : 50,
            fontWeight: 800,
            color: 'white',
            letterSpacing: '-0.025em',
            lineHeight: 1.15,
            marginBottom: 24,
            maxWidth: 900,
          }}
        >
          {name || 'Course'}
        </div>

        {/* Credits + status row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          {credits && (
            <div
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '6px 16px',
                fontSize: 16,
                fontWeight: 600,
                color: '#a1a1aa',
              }}
            >
              {credits} credits
            </div>
          )}
          {statusLabel && (
            <div
              style={{
                background: `${statusColor}18`,
                border: `1px solid ${statusColor}40`,
                borderRadius: 8,
                padding: '6px 16px',
                fontSize: 16,
                fontWeight: 700,
                color: statusColor,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {hasOpen && (
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: statusColor,
                  }}
                />
              )}
              {statusLabel}
            </div>
          )}
        </div>

        {/* Top professor */}
        {profName && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: '14px 20px',
              maxWidth: 480,
            }}
          >
            <div style={{ fontSize: 13, color: '#52525b', fontWeight: 500 }}>Top teacher</div>
            <div style={{ fontSize: 16, color: '#e4e4e7', fontWeight: 700 }}>{profName}</div>
            {profRating != null && (
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  color: ratingColor(profRating),
                  marginLeft: 4,
                }}
              >
                {profRating.toFixed(1)}★
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            left: 80,
            right: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            paddingTop: 18,
          }}
        >
          <span style={{ fontSize: 14, color: '#3f3f46' }}>rurate-web-production.up.railway.app</span>
          <span style={{ fontSize: 14, color: '#3f3f46' }}>Rutgers New Brunswick</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
