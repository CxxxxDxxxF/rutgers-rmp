'use client'

import { useCallback, useEffect, useState } from 'react'
import { TextFlippingBoard } from '@/components/ui/text-flipping-board'

const MESSAGES = [
  'FIND THE\nRIGHT PROF\nBEFORE ITS\nTOO LATE',
  'SEATS OPEN\nSEATS CLOSE\nWE SNIPE',
  'YOUR PROF\nHAS A 1.9\nGOOD LUCK.',
  'ADD/DROP\nENDS IN\n72 HOURS',
  'SEARCHED 198:111\nFOUND\n0 OPEN SEATS',
  'RATE YOUR\nPROFESSOR\nOR ELSE.',
]

export default function FlipBoardBanner() {
  const [idx, setIdx] = useState(0)

  const advance = useCallback(() => setIdx(i => (i + 1) % MESSAGES.length), [])

  useEffect(() => {
    const id = setInterval(advance, 5500)
    return () => clearInterval(id)
  }, [advance])

  return (
    <div
      className="flex flex-col items-center gap-3 py-10 cursor-pointer"
      onClick={advance}
      title="Click to advance"
    >
      <TextFlippingBoard text={MESSAGES[idx]} />
      <p className="text-[10px] text-zinc-700 tracking-widest uppercase">
        tap to advance
      </p>
    </div>
  )
}
