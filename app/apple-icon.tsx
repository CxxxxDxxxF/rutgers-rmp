import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #CC0033 0%, #990026 100%)',
          borderRadius: 40,
          color: 'white',
          fontSize: 112,
          fontWeight: 900,
        }}
      >
        R
      </div>
    ),
    size
  )
}
