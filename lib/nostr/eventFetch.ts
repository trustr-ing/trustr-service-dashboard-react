import type { NDKEvent } from '@nostr-dev-kit/ndk'
import { collectEvents, connectNDK, relaySetFor, EVENT_READ_RELAYS } from './ndk'

const eventCache = new Map<string, NDKEvent | null>()
/** A card must not spin forever on a relay that never answers. */
const EVENT_FETCH_TIMEOUT_MS = 8000
const HEX64 = /^[0-9a-f]{64}$/i

function newest(events: NDKEvent[]): NDKEvent | null {
  return [...events].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0] ?? null
}
const inFlight = new Map<string, Promise<NDKEvent | null>>()

export async function fetchEventByRef(
  resultTag: 'e' | 'a',
  subject: string,
): Promise<NDKEvent | null> {
  const cacheKey = `${resultTag}:${subject}`
  if (eventCache.has(cacheKey)) return eventCache.get(cacheKey) ?? null
  const existing = inFlight.get(cacheKey)
  if (existing) return existing

  const promise = (async () => {
    try {
      const ndk = await connectNDK()
      const relaySet = await relaySetFor(ndk, EVENT_READ_RELAYS)

      let event: NDKEvent | null = null
      if (resultTag === 'e') {
        if (!HEX64.test(subject)) return null
        event = newest(await collectEvents(ndk, { ids: [subject] }, relaySet, EVENT_FETCH_TIMEOUT_MS))
      } else {
        const parts = subject.split(':')
        if (parts.length !== 3) return null
        const kind = parseInt(parts[0], 10)
        const pubkey = parts[1]
        const identifier = parts[2] ?? ''
        if (!Number.isFinite(kind) || !pubkey) return null
        event = newest(await collectEvents(ndk, {
          kinds: [kind],
          authors: [pubkey],
          ...(identifier ? { '#d': [identifier] } : {}),
          limit: 1,
        }, relaySet, EVENT_FETCH_TIMEOUT_MS))
      }

      eventCache.set(cacheKey, event)
      return event
    } catch (err) {
      console.warn('[eventFetch] failed', cacheKey, err)
      eventCache.set(cacheKey, null)
      return null
    } finally {
      inFlight.delete(cacheKey)
    }
  })()

  inFlight.set(cacheKey, promise)
  return promise
}
