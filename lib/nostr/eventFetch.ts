import type { NDKEvent } from '@nostr-dev-kit/ndk'
import { connectNDK } from './ndk'

const eventCache = new Map<string, NDKEvent | null>()
/** A card must not spin forever on a relay that never answers. */
const EVENT_FETCH_TIMEOUT_MS = 8000

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), EVENT_FETCH_TIMEOUT_MS)),
  ])
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

      let event: NDKEvent | null = null
      if (resultTag === 'e') {
        event = await withTimeout(ndk.fetchEvent(subject), null)
      } else {
        const parts = subject.split(':')
        if (parts.length !== 3) return null
        const kind = parseInt(parts[0], 10)
        const pubkey = parts[1]
        const identifier = parts[2] ?? ''
        if (!Number.isFinite(kind) || !pubkey) return null
        const set = await withTimeout(ndk.fetchEvents({
          kinds: [kind],
          authors: [pubkey],
          ...(identifier ? { '#d': [identifier] } : {}),
          limit: 1,
        }), new Set<NDKEvent>())
        const arr = Array.from(set).sort(
          (a, b) => (b.created_at ?? 0) - (a.created_at ?? 0),
        )
        event = arr[0] ?? null
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
