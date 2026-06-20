'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number
  decimals?: number
  duration?: number
  className?: string
  suffix?: string
}

export default function NumberTicker({ value, decimals = 1, duration = 1200, className, suffix }: Props) {
  const [display, setDisplay] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return
        started.current = true
        observer.disconnect()

        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1)
          const eased = 1 - Math.pow(1 - t, 3)
          setDisplay(parseFloat((eased * value).toFixed(decimals)))
          if (t < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      { threshold: 0.3 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [value, decimals, duration])

  return (
    <span ref={ref} className={className}>
      {display.toFixed(decimals)}{suffix}
    </span>
  )
}
