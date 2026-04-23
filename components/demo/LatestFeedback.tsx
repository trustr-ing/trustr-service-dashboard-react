'use client'

import { useEffect, useState } from 'react'
import { ParsedFeedbackEvent } from '@/lib/nostr/events'

interface LatestFeedbackProps {
  active: boolean
  feedbackEvents: ParsedFeedbackEvent[]
  isConnected: boolean
  fallback?: string
}

export function LatestFeedback({ active, feedbackEvents, isConnected, fallback }: LatestFeedbackProps) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!active) return
    const start = Date.now()
    const interval = setInterval(() => setElapsedMs(Date.now() - start), 1000)
    return () => clearInterval(interval)
  }, [active])

  if (!active) {
    return <p className="text-xs text-gray-500 mt-2 min-h-[1rem]">{fallback ?? ''}</p>
  }

  const latest = feedbackEvents.at(-1)

  let text: string
  if (latest) {
    text = latest.status ? `${latest.status}: ${latest.message}` : latest.message
  } else if (isConnected) {
    text = 'Waiting for service response…'
  } else {
    text = 'Publishing…'
  }

  return (
    <p className="text-xs text-gray-500 mt-2 min-h-[1rem]">
      {text} <span className="text-gray-400">· {formatElapsed(elapsedMs)}</span>
    </p>
  )
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s elapsed`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}m ${remainder}s elapsed`
}
