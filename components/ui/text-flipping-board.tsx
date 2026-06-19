'use client'

import { useEffect, useRef, useState } from 'react'

const CHARSET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?-\''

function randomChar() {
  return CHARSET[Math.floor(Math.random() * CHARSET.length)]
}

function FlapTile({ char, colIdx }: { char: string; colIdx: number }) {
  const upper = char === ' ' ? ' ' : char.toUpperCase()
  const [display, setDisplay] = useState(upper)
  const cancelRef = useRef(false)
  const prevCharRef = useRef(upper)

  useEffect(() => {
    if (upper === prevCharRef.current) return
    prevCharRef.current = upper
    cancelRef.current = false

    const stagger = colIdx * 28 + Math.random() * 60
    const cycles = Math.floor(Math.random() * 7) + 4
    let count = 0

    const timeout = setTimeout(() => {
      const tick = () => {
        if (cancelRef.current) return
        count++
        if (count >= cycles) {
          setDisplay(upper)
          return
        }
        setDisplay(randomChar())
        setTimeout(tick, 45 + Math.random() * 35)
      }
      tick()
    }, stagger)

    return () => {
      cancelRef.current = true
      clearTimeout(timeout)
    }
  }, [upper, colIdx])

  const isSpace = upper === ' '

  return (
    <span
      className={`inline-flex items-center justify-center font-mono font-bold select-none leading-none
        ${isSpace ? 'bg-transparent border-transparent' : 'bg-zinc-800 border-zinc-700'}`}
      style={{
        width: '0.72em',
        height: '1.1em',
        borderRadius: '2px',
        margin: '0 1px',
        fontSize: 'inherit',
        position: 'relative',
        borderWidth: isSpace ? 0 : '1px',
        borderStyle: 'solid',
        boxShadow: isSpace ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 3px rgba(0,0,0,0.6)',
      }}
    >
      {/* top/bottom split line */}
      {!isSpace && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            height: '1px',
            background: 'rgba(0,0,0,0.6)',
            zIndex: 1,
          }}
        />
      )}
      <span className="text-white relative z-10">
        {display === ' ' ? ' ' : display}
      </span>
    </span>
  )
}

function FlapLine({ line }: { line: string }) {
  return (
    <div className="flex items-center justify-center flex-wrap" style={{ gap: '0' }}>
      {line.split('').map((char, i) => (
        <FlapTile key={i} char={char} colIdx={i} />
      ))}
    </div>
  )
}

export function TextFlippingBoard({ text }: { text: string }) {
  const lines = text.split('\n')

  return (
    <div
      className="inline-flex flex-col items-center gap-1.5 px-5 py-4 rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, #111 0%, #0d0d0d 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.8), 0 8px 32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      }}
    >
      {lines.map((line, i) => (
        <FlapLine key={i} line={line} />
      ))}
    </div>
  )
}
