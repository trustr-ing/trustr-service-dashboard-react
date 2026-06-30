import type NDK from '@nostr-dev-kit/ndk'
import type { NDKEvent } from '@nostr-dev-kit/ndk'
import { unwrapEvent, type GiftWrapSigner, type NostrEvent } from './giftWrap'
import { upsertFromStatusRumor } from './store'

const GIFT_WRAP_KIND = 1059
const SUBSCRIPTION_RUMOR_KIND = 7570

export interface StartStatusListenerArgs {
  ndk: NDK
  signer: GiftWrapSigner
  userPubkey: string
  /**
   * Optional gate: return `false` to reject a rumor whose seal was
   * signed by a pubkey the caller doesn't trust (e.g. not the messaging
   * pubkey of any known service announcement). Defaults to accept-all.
   *
   * Called AFTER successful decrypt + provenance check, so an unwanted
   * sealer cannot inject store mutations even if the gate is missing.
   */
  isAuthorizedSeal?: (sealPubkey: string) => boolean
  /** Optional hook for surfacing per-rumor errors to the UI (toasts, etc). */
  onError?: (error: Error, wrap: NostrEvent) => void
}

export interface StatusListenerHandle {
  /** Stops the relay subscription and detaches handlers. */
  stop: () => void
}

/**
 * Subscribe to incoming Subscription Status gift wraps for `userPubkey`
 * and reconcile every well-formed rumor into the local store.
 *
 * Filter: `{ kinds: [1059], "#p": [userPubkey], "#k": ["7570"] }` — the
 * `#k` tag is the rumor-kind hint the orchestrator advertises on the
 * outer wrap (see R2-A `wrapRumor`'s `outerKTag` and the orchestrator's
 * matching emit path in InquiryHandler).
 *
 * Replay safety: the store-side guard in `upsertFromStatusRumor` rejects
 * any rumor whose `created_at` is older than the cached state, so
 * historic gift wraps replayed by a relay cannot regress us.
 *
 * Returns a handle whose `stop()` MUST be called when the user logs out
 * or the host component unmounts.
 */
export function startStatusListener(args: StartStatusListenerArgs): StatusListenerHandle {
  const { ndk, signer, userPubkey, isAuthorizedSeal, onError } = args

  const seenWrapIds = new Set<string>()

  const subscription = ndk.subscribe(
    {
      kinds: [GIFT_WRAP_KIND],
      '#p': [userPubkey],
      '#k': [String(SUBSCRIPTION_RUMOR_KIND)],
    },
    { closeOnEose: false },
  )

  subscription.on('event', (event: NDKEvent) => {
    // NDK dedupes by id internally, but we keep a local set to avoid
    // re-decrypting the same wrap if it arrives on multiple relays
    // before NDK's cache catches it.
    if (seenWrapIds.has(event.id)) return
    seenWrapIds.add(event.id)

    const wrap = ndkEventToNostrEvent(event)
    void handleWrap(wrap, signer, userPubkey, isAuthorizedSeal, onError)
  })

  return {
    stop: () => {
      subscription.stop()
    },
  }
}

// ── Internal ────────────────────────────────────────────────────────────────

async function handleWrap(
  wrap: NostrEvent,
  signer: GiftWrapSigner,
  userPubkey: string,
  isAuthorizedSeal: ((sealPubkey: string) => boolean) | undefined,
  onError: ((error: Error, wrap: NostrEvent) => void) | undefined,
): Promise<void> {
  try {
    const { rumor, sealPubkey } = await unwrapEvent(signer, wrap)

    if (rumor.kind !== SUBSCRIPTION_RUMOR_KIND) {
      // The relay shouldn't deliver these given our #k filter, but the
      // filter is advisory (clients tag the outer wrap voluntarily) so
      // we re-check on the inner rumor.
      return
    }

    if (isAuthorizedSeal && !isAuthorizedSeal(sealPubkey)) {
      console.warn(
        `[subscription:listener] dropping rumor from unknown sealer ${sealPubkey.slice(0, 8)}...`,
      )
      return
    }

    const upserted = upsertFromStatusRumor(userPubkey, rumor, sealPubkey)
    if (upserted.length > 0) {
      console.log(
        `[subscription:listener] reconciled ${upserted.length} subscription(s) ` +
        `from rumor signed by ${sealPubkey.slice(0, 8)}...`,
      )
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.warn(
      `[subscription:listener] failed to handle wrap ${wrap.id.slice(0, 8)}...: ${error.message}`,
    )
    onError?.(error, wrap)
  }
}

function ndkEventToNostrEvent(event: NDKEvent): NostrEvent {
  return {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at ?? 0,
    kind: event.kind ?? 0,
    tags: event.tags,
    content: event.content,
    sig: event.sig ?? '',
  }
}
