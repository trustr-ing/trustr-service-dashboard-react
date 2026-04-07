'use client'

import { useEffect, useState, useCallback } from 'react'
import { NDKEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk'
import { getNDK } from '@/lib/nostr/ndk'
import { parseFeedbackEvent, parseOutputEvent, ParsedFeedbackEvent, ParsedOutputEvent } from '@/lib/nostr/events'

interface RequestMonitorState {
  feedbackEvents: ParsedFeedbackEvent[]
  outputEvents: ParsedOutputEvent[]
  isConnected: boolean
  error: string | null
}

export function useRequestMonitor(requestEventId: string | null) {
  const [state, setState] = useState<RequestMonitorState>({
    feedbackEvents: [],
    outputEvents: [],
    isConnected: false,
    error: null,
  })

  const updateState = useCallback((updates: Partial<RequestMonitorState>) => {
    setState((prev) => ({ ...prev, ...updates }))
  }, [])

  useEffect(() => {
    if (!requestEventId) return

    let subscription: NDKSubscription | null = null
    let mounted = true

    async function subscribe() {
      try {
        const ndk = getNDK()
        await ndk.connect()

        if (!mounted) return

        updateState({ isConnected: true, error: null })

        const filter: NDKFilter = {
          kinds: [7000 as number, 37573 as number],
          '#e': requestEventId ? [requestEventId] : undefined,
        }

        subscription = ndk.subscribe(filter, { closeOnEose: false })

        subscription.on('event', (event: NDKEvent) => {
          if (!mounted) return

          if (event.kind === 7000) {
            const feedback = parseFeedbackEvent(event)
            setState((prev) => ({
              ...prev,
              feedbackEvents: [...prev.feedbackEvents, feedback].sort(
                (a, b) => a.timestamp - b.timestamp
              ),
            }))
          } else if (event.kind === 37573) {
            const output = parseOutputEvent(event)
            setState((prev) => ({
              ...prev,
              outputEvents: [...prev.outputEvents, output].sort(
                (a, b) => a.timestamp - b.timestamp
              ),
            }))
          }
        })

        subscription.on('eose', () => {
          console.log('[monitor] End of stored events for request', requestEventId)
        })
      } catch (error) {
        console.error('[monitor] Subscription error:', error)
        if (mounted) {
          updateState({
            error: error instanceof Error ? error.message : 'Connection failed',
            isConnected: false,
          })
        }
      }
    }

    subscribe()

    return () => {
      mounted = false
      if (subscription) {
        subscription.stop()
      }
    }
  }, [requestEventId, updateState])

  return state
}
