'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { NDKEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk'
import { getNDK } from '@/lib/nostr/ndk'
import { parseFeedbackEvent, parseOutputEvent, ParsedFeedbackEvent, ParsedOutputEvent } from '@/lib/nostr/events'

// Prevent duplicate rendering when we backfill and subscribe
interface SeenMaps {
  feedbackIds: Set<string>
  outputIds: Set<string>
}

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

  const seenRef = useRef<SeenMaps>({
    feedbackIds: new Set(),
    outputIds: new Set(),
  })

  const updateState = useCallback((updates: Partial<RequestMonitorState>) => {
    setState((prev) => ({ ...prev, ...updates }))
  }, [])

  useEffect(() => {
    if (!requestEventId) return
    const activeRequestEventId = requestEventId

    seenRef.current.feedbackIds.clear()
    seenRef.current.outputIds.clear()

    let subscription: NDKSubscription | null = null
    let mounted = true
    let reconnectTimer: NodeJS.Timeout | null = null

    async function subscribe() {
      try {
        const ndk = getNDK()
        await ndk.connect()

        if (!mounted) return

        updateState({ isConnected: true, error: null })

        const filter: NDKFilter = {
          kinds: [7000 as number, 37573 as number],
          '#e': [activeRequestEventId],
        }

        // Backfill existing events in case we missed any while disconnected
        const historical = await ndk.fetchEvents(filter)
        if (!mounted) return
        const feedbackBatch: ParsedFeedbackEvent[] = []
        const outputBatch: ParsedOutputEvent[] = []
        for (const event of historical) {
          if (event.kind === 7000 && !seenRef.current.feedbackIds.has(event.id)) {
            seenRef.current.feedbackIds.add(event.id)
            feedbackBatch.push(parseFeedbackEvent(event))
          }
          if (event.kind === 37573 && !seenRef.current.outputIds.has(event.id)) {
            seenRef.current.outputIds.add(event.id)
            outputBatch.push(parseOutputEvent(event))
          }
        }
        if (feedbackBatch.length || outputBatch.length) {
          setState(prev => ({
            ...prev,
            feedbackEvents: [...prev.feedbackEvents, ...feedbackBatch].sort((a, b) => a.timestamp - b.timestamp),
            outputEvents: [...prev.outputEvents, ...outputBatch].sort((a, b) => a.timestamp - b.timestamp),
          }))
        }

        subscription = ndk.subscribe(filter, { closeOnEose: false })

        subscription.on('event', (event: NDKEvent) => {
          if (!mounted) return

          if (event.kind === 7000) {
            if (seenRef.current.feedbackIds.has(event.id)) return
            seenRef.current.feedbackIds.add(event.id)
            const feedback = parseFeedbackEvent(event)
            setState((prev) => ({
              ...prev,
              feedbackEvents: [...prev.feedbackEvents, feedback].sort(
                (a, b) => a.timestamp - b.timestamp
              ),
            }))
          } else if (event.kind === 37573) {
            if (seenRef.current.outputIds.has(event.id)) return
            seenRef.current.outputIds.add(event.id)
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
          console.log('[monitor] End of stored events for request', activeRequestEventId)
        })
      } catch (error) {
        console.error('[monitor] Subscription error:', error)
        if (mounted) {
          updateState({
            error: error instanceof Error ? error.message : 'Connection failed',
            isConnected: false,
          })
          // Retry after a short delay to backfill missed events
          reconnectTimer = setTimeout(() => {
            if (mounted) {
              void subscribe()
            }
          }, 2000)
        }
      }
    }

    subscribe()

    return () => {
      mounted = false
      if (subscription) {
        subscription.stop()
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
    }
  }, [requestEventId, updateState])

  return state
}
