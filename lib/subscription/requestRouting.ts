import { findActiveSubscriptionForService, type StoredSubscription } from './store'

export interface PickRequestPTagArgs {
  /**
   * The logged-in user's identity pubkey (hex). `null` when login is
   * still resolving — in that case we fall back to the service pubkey.
   */
  userPubkey: string | null
  /** The service's own pubkey (kind-37570 author / public_service p-tag). */
  servicePubkey: string
  /** Service id matching `["d", <serviceId>]` on the announcement. */
  serviceId: string
}

export interface PickRequestPTagResult {
  /**
   * What to put in the kind-37572 request's `["p", ...]` tag.
   *
   * - When an active subscription exists for `serviceId`, this is the
   *   orchestrator-issued subscription pubkey (subscription_service mode).
   * - Otherwise it falls through to `servicePubkey` (public_service mode).
   */
  pTagPubkey: string
  /** True iff the p-tag was sourced from a stored subscription. */
  viaSubscription: boolean
  /** The matched subscription, when applicable. Useful for debug logging. */
  subscription?: StoredSubscription
}

/**
 * Decide which pubkey to address a kind-37572 request to.
 *
 * Subscription-aware callers MUST route through this helper so that the
 * orchestrator's KeyResolver picks the matching subscription pubkey (per
 * Block F). Routing through the bare `servicePubkey` continues to work
 * for any service still in `public_service` mode (default through R2).
 *
 * Pure function (no React); safe for use inside event-build code paths.
 */
export function pickRequestPTag(args: PickRequestPTagArgs): PickRequestPTagResult {
  const { userPubkey, servicePubkey, serviceId } = args

  if (userPubkey) {
    const subscription = findActiveSubscriptionForService(userPubkey, serviceId)
    if (subscription) {
      return {
        pTagPubkey: subscription.subscriptionPubkey,
        viaSubscription: true,
        subscription,
      }
    }
  }

  return {
    pTagPubkey: servicePubkey,
    viaSubscription: false,
  }
}
