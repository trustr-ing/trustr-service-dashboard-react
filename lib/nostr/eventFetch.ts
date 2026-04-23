import type { NDKEvent } from '@nostr-dev-kit/ndk'
import { getNDK } from './ndk'

const eventCache = new Map<string, NDKEvent | null>()
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
      const ndk = getNDK()
      await ndk.connect()

      let event: NDKEvent | null = null
      if (resultTag === 'e') {
        event = await ndk.fetchEvent(subject)
      } else {
        const parts = subject.split(':')
        if (parts.length !== 3) return null
        const kind = parseInt(parts[0], 10)
        const pubkey = parts[1]
        const identifier = parts[2] ?? ''
        if (!Number.isFinite(kind) || !pubkey) return null
        const set = await ndk.fetchEvents({
          kinds: [kind],
          authors: [pubkey],
          ...(identifier ? { '#d': [identifier] } : {}),
          limit: 1,
        })
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
