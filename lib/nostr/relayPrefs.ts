import type { NDKEvent } from '@nostr-dev-kit/ndk'
import { connectNDK } from './ndk'

export interface RelayPrefs {
  read: string[]
  write: string[]
}

const TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  prefs: RelayPrefs
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<RelayPrefs>>()

const RELAY_URL_REGEX = /^wss?:\/\//i

function normalizeRelayUrl(url: string | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  if (!RELAY_URL_REGEX.test(trimmed)) return null
  return trimmed
}

function parseRelayListEvent(event: NDKEvent): RelayPrefs {
  const read: string[] = []
  const write: string[] = []

  for (const tag of event.tags) {
    if (tag[0] !== 'r') continue
    const url = normalizeRelayUrl(tag[1])
    if (!url) continue

    const marker = tag[2]?.trim().toLowerCase()
    if (marker === 'read') {
      if (!read.includes(url)) read.push(url)
    } else if (marker === 'write') {
      if (!write.includes(url)) write.push(url)
    } else {
      if (!read.includes(url)) read.push(url)
      if (!write.includes(url)) write.push(url)
    }
  }

  return { read, write }
}

export async function fetchRelayPrefs(pubkey: string): Promise<RelayPrefs> {
  const now = Date.now()
  const cached = cache.get(pubkey)
  if (cached && cached.expiresAt > now) return cached.prefs

  const existing = inFlight.get(pubkey)
  if (existing) return existing

  const promise = (async (): Promise<RelayPrefs> => {
    try {
      const ndk = await connectNDK()
      const event = await Promise.race([
        ndk.fetchEvent({ kinds: [10002], authors: [pubkey] }),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 8000)),
      ])
      const prefs: RelayPrefs = event ? parseRelayListEvent(event) : { read: [], write: [] }
      cache.set(pubkey, { prefs, expiresAt: Date.now() + TTL_MS })
      return prefs
    } catch (err) {
      console.warn('[relayPrefs] failed to fetch NIP-65 for', pubkey.slice(0, 8), err)
      const prefs: RelayPrefs = { read: [], write: [] }
      cache.set(pubkey, { prefs, expiresAt: Date.now() + TTL_MS })
      return prefs
    } finally {
      inFlight.delete(pubkey)
    }
  })()

  inFlight.set(pubkey, promise)
  return promise
}

export async function getUserWriteRelays(
  pubkey: string,
  fallback: string[] = [],
): Promise<string[]> {
  const prefs = await fetchRelayPrefs(pubkey)
  return prefs.write.length > 0 ? prefs.write : fallback
}

export async function getUserReadRelays(
  pubkey: string,
  fallback: string[] = [],
): Promise<string[]> {
  const prefs = await fetchRelayPrefs(pubkey)
  return prefs.read.length > 0 ? prefs.read : fallback
}

export function clearRelayPrefsCache(pubkey?: string): void {
  if (pubkey) cache.delete(pubkey)
  else cache.clear()
}
