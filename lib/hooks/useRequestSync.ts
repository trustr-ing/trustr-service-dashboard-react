'use client'

import { useState, useCallback } from 'react'
import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk'
import { getNDK } from '@/lib/nostr/ndk'
import { buildOutputEventNaddrFromNdkEvent } from '@/lib/nostr/naddr'

interface SyncResult {
  imported: number
  updated: number
  skipped: number
}

interface SyncState {
  syncing: boolean
  lastSyncResult: SyncResult | null
  error: string | null
}

export function useRequestSync(userPubkey: string | null) {
  const [state, setState] = useState<SyncState>({
    syncing: false,
    lastSyncResult: null,
    error: null,
  })

  const syncFromRelays = useCallback(async (): Promise<SyncResult | null> => {
    if (!userPubkey) return null

    setState(prev => ({ ...prev, syncing: true, error: null }))

    try {
      const ndk = getNDK()
      await ndk.connect()

      // 1. Fetch all kind 37572 request events authored by this user
      const requestFilter: NDKFilter = {
        kinds: [37572 as number],
        authors: [userPubkey],
      }

      const requestEvents = await ndk.fetchEvents(requestFilter)
      const requestEventsArray = Array.from(requestEvents)

      if (requestEventsArray.length === 0) {
        setState(prev => ({ ...prev, syncing: false, lastSyncResult: { imported: 0, updated: 0, skipped: 0 } }))
        return { imported: 0, updated: 0, skipped: 0 }
      }

      // 2. For each request, find output events (kind 37573) and feedback events (kind 7000)
      const requestEventIds = requestEventsArray.map(e => e.id)

      const responseFilter: NDKFilter = {
        kinds: [7000 as number, 37573 as number],
        '#e': requestEventIds,
      }

      const responseEvents = await ndk.fetchEvents(responseFilter)
      const responseEventsArray = Array.from(responseEvents)

      // Group output and feedback events by request event ID
      const outputsByRequest = new Map<string, NDKEvent[]>()
      const feedbackByRequest = new Map<string, NDKEvent[]>()

      for (const event of responseEventsArray) {
        const requestRef = event.tags.find(t => t[0] === 'e')?.[1]
        if (!requestRef) continue

        if (event.kind === 37573) {
          const existing = outputsByRequest.get(requestRef) || []
          existing.push(event)
          outputsByRequest.set(requestRef, existing)
        } else if (event.kind === 7000) {
          const existing = feedbackByRequest.get(requestRef) || []
          existing.push(event)
          feedbackByRequest.set(requestRef, existing)
        }
      }

      // 3. Build sync payload
      const syncEvents = requestEventsArray.map(reqEvent => {
        const outputs = outputsByRequest.get(reqEvent.id) || []
        const feedbacks = feedbackByRequest.get(reqEvent.id) || []
        const hasOutputs = outputs.length > 0
        const hasTerminalSuccess = feedbacks.some((feedback) => {
          const statusTag = feedback.tags.find((tag) => tag[0] === 'status')
          const status = statusTag?.[1]
          const message = (statusTag?.[2] || feedback.content || '').toLowerCase()
          return status === 'success' && message.includes('completed successfully')
        })

        // Extract config from tags
        const configObj: Record<string, string> = {}
        reqEvent.tags
          .filter(t => t[0] === 'config' && t[1] && t[2])
          .forEach(t => { configObj[t[1]] = t[2] })

        const titleTag = reqEvent.tags.find(t => t[0] === 'title')
        if (titleTag?.[1]) {
          configObj.title = titleTag[1]
        }

        // Generate naddr for first output event if available
        let firstOutputNaddr: string | null = null
        if (outputs.length > 0) {
          firstOutputNaddr = buildOutputEventNaddrFromNdkEvent(outputs[0])
        }

        return {
          eventId: reqEvent.id,
          configData: JSON.stringify(configObj),
          publishedAt: reqEvent.created_at || Math.floor(Date.now() / 1000),
          status: hasOutputs && hasTerminalSuccess ? 'completed' : 'pending',
          resultEventIds: outputs.map(e => e.id),
          feedbackEventIds: feedbacks.map(e => e.id),
          firstOutputNaddr,
        }
      })

      // 4. Send to sync API
      const response = await fetch('/api/requests/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: syncEvents }),
      })

      if (!response.ok) {
        throw new Error(`Sync API returned ${response.status}`)
      }

      const result: SyncResult = await response.json()
      setState(prev => ({ ...prev, syncing: false, lastSyncResult: result }))
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed'
      console.error('[sync] Error syncing from relays:', error)
      setState(prev => ({ ...prev, syncing: false, error: message }))
      return null
    }
  }, [userPubkey])

  return { ...state, syncFromRelays }
}
