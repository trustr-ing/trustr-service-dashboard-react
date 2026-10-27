import { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk'
import { connectNDK } from '@/lib/nostr/ndk'
import { getUserWriteRelays } from '@/lib/nostr/relayPrefs'
import { TRUSTR_RELAY_URL } from '@/lib/config'

/** NIP-85 "Trusted Service Provider" list. */
export const TRUSTED_PROVIDERS_KIND = 10040
/** Provider slot for kind-30382 `rank` assertions, per NIP-85. */
export const RANK_PROVIDER_TAG = '30382:rank'

const FETCH_TIMEOUT_MS = 8_000

export interface BuildTrustedProvidersArgs {
  /** The logged-in user's identity pubkey (hex). */
  userPubkey: string
  /** Pubkey that signs the user's 30382 events (their TrustR subscription key). */
  providerPubkey: string
  /** Relay hint written next to the provider pubkey. */
  relayHint?: string
}

export interface BuildTrustedProvidersResult {
  event: NDKEvent
  /** True when the user already had a `30382:rank` provider that is now replaced. */
  replacedExisting: boolean
  /** Number of other provider entries carried over unchanged. */
  preservedEntries: number
}

/**
 * Build the user's kind-10040 list with `30382:rank` pointed at
 * `providerPubkey`, preserving every other entry of their existing list.
 *
 * The existing list is looked up on the default pool plus the user's
 * NIP-65 write relays, where replaceable events live, so that a list kept
 * only on the user's own relays is not silently overwritten.
 */
export async function buildTrustedProvidersEvent(
  args: BuildTrustedProvidersArgs,
): Promise<BuildTrustedProvidersResult> {
  const ndk = await connectNDK()

  const writeRelays = await getUserWriteRelays(args.userPubkey, [])
  for (const url of writeRelays) {
    if (!ndk.pool.getRelay(url, false)) {
      try {
        ndk.addExplicitRelay(url, undefined, true)
      } catch (err) {
        console.warn('[export] failed to add relay for 10040 lookup', url, err)
      }
    }
  }

  const filter = { kinds: [TRUSTED_PROVIDERS_KIND], authors: [args.userPubkey] }
  let existing: NDKEvent | null = null
  try {
    const relayUrls = Array.from(new Set([...writeRelays]))
    const relaySet = relayUrls.length > 0 ? NDKRelaySet.fromRelayUrls(relayUrls, ndk, true) : undefined
    existing = await Promise.race([
      ndk.fetchEvent(filter, undefined, relaySet),
      new Promise<null>(resolve => setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)),
    ])
    if (!existing) {
      existing = await Promise.race([
        ndk.fetchEvent(filter),
        new Promise<null>(resolve => setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)),
      ])
    }
  } catch (err) {
    console.warn('[export] 10040 lookup failed; building a fresh list', err)
  }

  const existingTags = existing?.tags ?? []
  const preserved = existingTags.filter(t => t[0] !== RANK_PROVIDER_TAG)
  const replacedExisting = existingTags.length !== preserved.length

  const event = new NDKEvent(ndk)
  event.kind = TRUSTED_PROVIDERS_KIND
  event.content = existing?.content ?? ''
  event.tags = [
    ...preserved,
    [RANK_PROVIDER_TAG, args.providerPubkey, args.relayHint ?? TRUSTR_RELAY_URL],
  ]

  return { event, replacedExisting, preservedEntries: preserved.length }
}
