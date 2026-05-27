import { NDKRelaySet, type NDKEvent } from '@nostr-dev-kit/ndk'
import { nip19 } from 'nostr-tools'
import { connectNDK } from '@/lib/nostr/ndk'

/**
 * Fetch the latest replaceable event referenced by an `naddr` string.
 *
 * Used by export flows to (re-)load a demo's kind-37573 output event for
 * tag inspection without depending on a live in-memory monitor.
 *
 * Strategy (in order):
 *   1. `ndk.fetchEvent(naddr)` — NDK internally decodes naddr and uses the
 *      relay hints embedded in the pointer.
 *   2. Explicit filter (`kind` + `authors` + `#d`) against a relay set
 *      constructed from the naddr's relay hints (when present), falling
 *      back to the connected pool.
 *   3. Same filter against the full pool.
 *
 * Each step that yields nothing logs a short diagnostic so the user can
 * see why a relay set was insufficient.
 */
export async function fetchOutputEventByNaddr(naddr: string): Promise<NDKEvent | null> {
  const pointer = decodeNaddr(naddr)
  if (!pointer) {
    console.warn('[fetchOutputEvent] failed to decode naddr', naddr.slice(0, 24))
    return null
  }

  console.log('[fetchOutputEvent] resolving naddr', {
    kind: pointer.kind,
    pubkey: pointer.pubkey.slice(0, 16),
    identifier: pointer.identifier,
    relayHints: pointer.relays ?? [],
  })

  const ndk = await connectNDK()

  // Step 1: NDK-managed naddr fetch (handles relay hints internally).
  try {
    const event = await ndk.fetchEvent(naddr)
    if (event) {
      console.log('[fetchOutputEvent] resolved via naddr-string fetch')
      return event
    }
  } catch (err) {
    console.warn('[fetchOutputEvent] naddr-string fetch threw', err)
  }

  const filter = {
    kinds: [pointer.kind],
    authors: [pointer.pubkey],
    '#d': [pointer.identifier],
  }

  // Step 2: explicit filter against hint relays.
  const hintUrls = (pointer.relays ?? []).filter(Boolean)
  if (hintUrls.length > 0) {
    try {
      const relaySet = NDKRelaySet.fromRelayUrls(hintUrls, ndk, true)
      const event = await ndk.fetchEvent(filter, undefined, relaySet)
      if (event) {
        console.log('[fetchOutputEvent] resolved via hint-relay filter', hintUrls)
        return event
      }
    } catch (err) {
      console.warn('[fetchOutputEvent] hint-relay filter threw', err)
    }
  }

  // Step 3: filter against the full default pool.
  try {
    const event = await ndk.fetchEvent(filter)
    if (event) {
      console.log('[fetchOutputEvent] resolved via default-pool filter')
      return event
    }
  } catch (err) {
    console.warn('[fetchOutputEvent] default-pool filter threw', err)
  }

  console.warn('[fetchOutputEvent] no event found for naddr', {
    kind: pointer.kind,
    pubkey: pointer.pubkey.slice(0, 16),
    identifier: pointer.identifier,
  })
  return null
}

function decodeNaddr(naddr: string): nip19.AddressPointer | null {
  try {
    const decoded = nip19.decode(naddr)
    if (decoded.type !== 'naddr') return null
    return decoded.data as nip19.AddressPointer
  } catch {
    return null
  }
}

/**
 * Extract relay hints from an naddr (for use as `r` tag suggestions).
 */
export function getRelayHintsFromNaddr(naddr: string): string[] {
  try {
    const decoded = nip19.decode(naddr)
    if (decoded.type !== 'naddr') return []
    const pointer = decoded.data as nip19.AddressPointer
    return pointer.relays ?? []
  } catch {
    return []
  }
}
