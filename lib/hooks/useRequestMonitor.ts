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
    if (!requestEventId) {
      seenRef.current.feedbackIds.clear()
      seenRef.current.outputIds.clear()
      return
    }
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

        subscription = ndk.subscribe(filter, { closeOnEose: false })

        subscription.on('event', (event: NDKEvent) => {
          if (!mounted) return

          if (event.kind === 7000) {
            if (seenRef.current.feedbackIds.has(event.id)) return
            const feedback = parseFeedbackEvent(event)
            // Accept feedback when any e-tag explicitly references the active request,
            // even if the parser selected a different e-tag as the request id.
            const hasActiveRequestReference = event.tags.some(
              (tag) => tag[0] === 'e' && tag[1] === activeRequestEventId
            )
            if (feedback.requestEventId !== activeRequestEventId && !hasActiveRequestReference) return
            seenRef.current.feedbackIds.add(event.id)
            // Normalize the stored request id so downstream consumers can reliably filter
            // by the active request without re-checking raw tags.
            const normalizedFeedback = feedback.requestEventId === activeRequestEventId
              ? feedback
              : { ...feedback, requestEventId: activeRequestEventId }
            setState((prev) => ({
              ...prev,
              feedbackEvents: [...prev.feedbackEvents, normalizedFeedback].sort(
                (a, b) => a.timestamp - b.timestamp
              ),
            }))
          } else if (event.kind === 37573) {
            if (seenRef.current.outputIds.has(event.id)) return
            const output = parseOutputEvent(event)
            // Apply the same fallback rule for output events to prevent false negatives
            // when services emit multiple e-tags with different markers.
            const hasActiveRequestReference = event.tags.some(
              (tag) => tag[0] === 'e' && tag[1] === activeRequestEventId
            )
            if (output.requestEventId !== activeRequestEventId && !hasActiveRequestReference) return
            seenRef.current.outputIds.add(event.id)
            const normalizedOutput = output.requestEventId === activeRequestEventId
              ? output
              : { ...output, requestEventId: activeRequestEventId }
            setState((prev) => ({
              ...prev,
              outputEvents: [...prev.outputEvents, normalizedOutput].sort(
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

  const feedbackEvents = requestEventId
    ? state.feedbackEvents.filter((event) => event.requestEventId === requestEventId)
    : []
  const outputEvents = requestEventId
    ? state.outputEvents.filter((event) => event.requestEventId === requestEventId)
    : []

  return {
    ...state,
    feedbackEvents,
    outputEvents,
    isConnected: requestEventId ? state.isConnected : false,
  }
}
