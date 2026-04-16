import type { NDKEvent, NDKRelay } from '@nostr-dev-kit/ndk'
import { nip19 } from 'nostr-tools'

const RELAY_PROTOCOL_REGEX = /^wss?:\/\//i

interface NaddrPointerInput {
  kind: number
  pubkey: string
  identifier: string
  relayHints?: string[]
}

interface OutputEventPointer {
  kind: number
  pubkey: string
  tags: string[][]
  relayHints?: string[]
}

function normalizeRelayUrl(relayUrl: string): string | null {
  const normalizedRelayUrl = relayUrl.trim()
  if (!normalizedRelayUrl) return null
  if (!RELAY_PROTOCOL_REGEX.test(normalizedRelayUrl)) return null
  return normalizedRelayUrl
}

function relayToUrl(relay: NDKRelay | string | undefined): string | null {
  if (!relay) return null
  if (typeof relay === 'string') {
    return normalizeRelayUrl(relay)
  }

  return normalizeRelayUrl(relay.url)
}

function dedupeRelayHints(relayHints: string[]): string[] {
  const dedupedRelayHints: string[] = []
  for (const relayHint of relayHints) {
    const normalizedRelayHint = normalizeRelayUrl(relayHint)
    if (!normalizedRelayHint) continue
    if (!dedupedRelayHints.includes(normalizedRelayHint)) {
      dedupedRelayHints.push(normalizedRelayHint)
    }
  }
  return dedupedRelayHints
}

export function extractRelayHintsFromEvent(event: Pick<NDKEvent, 'relay' | 'onRelays'>): string[] {
  const relayHints: string[] = []

  const firstRelayUrl = relayToUrl(event.relay)
  if (firstRelayUrl) {
    relayHints.push(firstRelayUrl)
  }

  for (const relay of event.onRelays ?? []) {
    const relayUrl = relayToUrl(relay)
    if (relayUrl) {
      relayHints.push(relayUrl)
    }
  }

  return dedupeRelayHints(relayHints)
}

export function buildNaddrWithRelayHints({
  kind,
  pubkey,
  identifier,
  relayHints = [],
}: NaddrPointerInput): string {
  const normalizedRelayHints = dedupeRelayHints(relayHints)

  return nip19.naddrEncode({
    kind,
    pubkey,
    identifier,
    ...(normalizedRelayHints.length > 0 ? { relays: normalizedRelayHints } : {}),
  })
}

export function buildOutputEventNaddr(outputEvent: OutputEventPointer): string | null {
  const dTag = outputEvent.tags.find(tag => tag[0] === 'd')?.[1]
  if (!dTag || !outputEvent.kind || !outputEvent.pubkey) {
    return null
  }

  try {
    return buildNaddrWithRelayHints({
      kind: outputEvent.kind,
      pubkey: outputEvent.pubkey,
      identifier: dTag,
      relayHints: outputEvent.relayHints,
    })
  } catch {
    return null
  }
}

export function buildOutputEventNaddrFromNdkEvent(event: NDKEvent): string | null {
  if (!event.kind || !event.pubkey) {
    return null
  }
  return buildOutputEventNaddr({
    kind: event.kind,
    pubkey: event.pubkey,
    tags: event.tags,
    relayHints: extractRelayHintsFromEvent(event),
  })
}
