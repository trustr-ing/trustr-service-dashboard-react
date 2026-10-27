import type { NDKEvent } from '@nostr-dev-kit/ndk'
import { collectEvents, connectNDK, relaySetFor, PROFILE_READ_RELAYS } from './ndk'

export interface NostrProfile {
  pubkey: string
  name?: string
  display_name?: string
  picture?: string
  about?: string
  nip05?: string
}

const profileCache = new Map<string, NostrProfile>()

/** Pubkeys per kind-0 request. Relays answer a few hundred authors per REQ comfortably. */
const PROFILE_CHUNK_SIZE = 150
/** Give up on a chunk after this long; unresolved pubkeys fall back to bare keys. */
const PROFILE_CHUNK_TIMEOUT_MS = 8000

const HEX64 = /^[0-9a-f]{64}$/i

function profileFromEvent(event: NDKEvent): NostrProfile {
  let content: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(event.content || '{}')
    if (parsed && typeof parsed === 'object') content = parsed as Record<string, unknown>
  } catch {
    // malformed kind-0 content: keep the bare pubkey
  }
  const str = (key: string): string | undefined => {
    const value = content[key]
    return typeof value === 'string' && value.trim() ? value : undefined
  }
  return {
    pubkey: event.pubkey,
    name: str('name'),
    display_name: str('display_name') ?? str('displayName'),
    picture: str('picture') ?? str('image'),
    about: str('about'),
    nip05: str('nip05'),
  }
}

export async function fetchProfile(pubkey: string): Promise<NostrProfile> {
  const cached = profileCache.get(pubkey)
  if (cached) return cached
  const profiles = await fetchProfiles([pubkey])
  return profiles.get(pubkey) ?? { pubkey }
}


/**
 * Fetch kind-0 profiles for many pubkeys with one relay request per chunk
 * of PROFILE_CHUNK_SIZE authors, newest event per pubkey winning. Cached
 * pubkeys are not refetched. `onProgress` receives a snapshot after every
 * chunk so callers can render names as they arrive instead of waiting for
 * the whole set. Pubkeys that no relay answers for are cached as bare
 * profiles so a re-render does not refetch them.
 */
export async function fetchProfiles(
  pubkeys: string[],
  onProgress?: (profiles: Map<string, NostrProfile>) => void,
): Promise<Map<string, NostrProfile>> {
  const profiles = new Map<string, NostrProfile>()
  const toFetch: string[] = []
  const seen = new Set<string>()

  for (const pubkey of pubkeys) {
    if (!pubkey || seen.has(pubkey)) continue
    seen.add(pubkey)
    const cached = profileCache.get(pubkey)
    if (cached) profiles.set(pubkey, cached)
    else if (HEX64.test(pubkey)) toFetch.push(pubkey)
    else profiles.set(pubkey, { pubkey })
  }
  if (profiles.size > 0) onProgress?.(new Map(profiles))
  if (toFetch.length === 0) return profiles

  const ndk = await connectNDK()
  const relaySet = await relaySetFor(ndk, PROFILE_READ_RELAYS)

  for (let i = 0; i < toFetch.length; i += PROFILE_CHUNK_SIZE) {
    const chunk = toFetch.slice(i, i + PROFILE_CHUNK_SIZE)
    const newest = new Map<string, NDKEvent>()
    try {
      // Resolves on end-of-stream or at the timeout with whatever arrived;
      // an unreachable relay in the set no longer discards the others' answers.
      const events = await collectEvents(
        ndk,
        { kinds: [0], authors: chunk, limit: chunk.length },
        relaySet,
        PROFILE_CHUNK_TIMEOUT_MS,
      )
      for (const event of events) {
        const prior = newest.get(event.pubkey)
        if (!prior || (event.created_at ?? 0) > (prior.created_at ?? 0)) newest.set(event.pubkey, event)
      }
    } catch (err) {
      console.warn('[profiles] chunk fetch failed', err)
    }

    for (const pubkey of chunk) {
      const event = newest.get(pubkey)
      const profile = event ? profileFromEvent(event) : { pubkey }
      profileCache.set(pubkey, profile)
      profiles.set(pubkey, profile)
    }
    onProgress?.(new Map(profiles))
  }

  return profiles
}

export function getDisplayName(profile: NostrProfile): string {
  return profile.display_name || profile.name || `${profile.pubkey.slice(0, 8)}...`
}
