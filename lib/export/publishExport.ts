import { NDKEvent, NDKRelaySet, normalizeRelayUrl } from '@nostr-dev-kit/ndk'
import { connectNDK, getNDK, getNip07Signer } from '@/lib/nostr/ndk'
import { getUserWriteRelays } from '@/lib/nostr/relayPrefs'
import { TRUSTR_RELAY_URL } from '@/lib/config'

const PUBLISH_TIMEOUT_MS = 15_000
const REQUIRED_OK = 1

export interface PublishResult {
  signedEventId: string
  publishedTo: string[]
  failedTo: string[]
}

/**
 * Sign an unsigned export event with the user's NIP-07 signer and publish
 * it to the union of `wss://relay.trustr.ing` and the user's NIP-65
 * outbox (write) relays. A user without a NIP-65 list gets the app's
 * default relays instead, so exports still reach relays that other
 * clients read.
 */
function safeNormalize(url: string): string {
  try {
    return normalizeRelayUrl(url)
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, '')
  }
}

export async function signAndPublishExport(event: NDKEvent): Promise<PublishResult> {
  const signer = await getNip07Signer()
  if (!signer) throw new Error('Nostr signer not available (NIP-07)')

  const ndk = await connectNDK()
  ndk.signer = signer

  await event.sign(signer)

  const user = await signer.user()
  const appDefaultRelays = ndk.explicitRelayUrls ?? []
  const userWriteRelays = user.pubkey
    ? await getUserWriteRelays(user.pubkey, appDefaultRelays)
    : appDefaultRelays

  // Compare relays by normalized URL: NDK reports acks with a trailing
  // slash (`wss://host/`), which never matched our bare strings and made
  // every export report "0 relay(s)".
  const targetByNormalized = new Map<string, string>()
  for (const url of [TRUSTR_RELAY_URL, ...userWriteRelays]) {
    targetByNormalized.set(safeNormalize(url), url)
  }
  const targetRelays = Array.from(targetByNormalized.values())

  // Ensure NDK has connections to all target relays before publishing.
  for (const url of targetRelays) {
    if (!ndk.pool.getRelay(url, false)) {
      try {
        ndk.addExplicitRelay(url, undefined, true)
      } catch (err) {
        console.warn('[export] failed to add relay', url, err)
      }
    }
  }

  const relaySet = NDKRelaySet.fromRelayUrls(targetRelays, ndk, true)
  const acks = await event.publish(relaySet, PUBLISH_TIMEOUT_MS, REQUIRED_OK)
  const ackUrls = new Set<string>()
  for (const relay of acks) {
    ackUrls.add(safeNormalize(relay.url))
  }

  const publishedTo = targetRelays.filter(url => ackUrls.has(safeNormalize(url)))
  const failedTo = targetRelays.filter(url => !ackUrls.has(safeNormalize(url)))

  return {
    signedEventId: event.id,
    publishedTo,
    failedTo,
  }
}

/**
 * Reuse the same NDK instance to publish to a specific relay set.
 *
 * Exposed primarily for tests; production code should call
 * `signAndPublishExport` so user write relays are discovered automatically.
 */
export function _getNdk() {
  return getNDK()
}
