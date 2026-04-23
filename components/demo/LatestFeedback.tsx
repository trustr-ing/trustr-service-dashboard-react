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
  const progressValue = latest?.progress ?? null

  let text: string
  if (latest) {
    text = latest.status ? `${latest.status}: ${latest.message}` : latest.message
  } else if (isConnected) {
    text = 'Waiting for service response…'
  } else {
    text = 'Publishing…'
  }

  const progressWidth = progressValue !== null ? `${progressValue}%` : '18%'
  const progressLabel = progressValue !== null ? `${progressValue}%` : 'Estimating…'

  return (
    <div className="mt-2 min-h-[1rem] space-y-1.5">
      <p className="text-xs text-gray-500">
        {text} <span className="text-gray-400">· {formatElapsed(elapsedMs)}</span>
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
        <div
          className={progressValue !== null
            ? 'h-full rounded bg-blue-600 dark:bg-blue-400 transition-[width] duration-500'
            : 'h-full rounded bg-gray-400 dark:bg-gray-500 animate-pulse'
          }
          style={{ width: progressWidth }}
        />
      </div>
      <p className="text-[10px] text-gray-400">{progressLabel}</p>
    </div>
  )
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s elapsed`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}m ${remainder}s elapsed`
}
