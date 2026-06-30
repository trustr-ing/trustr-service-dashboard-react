'use client'

import { useSyncExternalStore } from 'react'
import {
  findActiveSubscriptionForService,
  listSubscriptions,
  subscribeToChanges,
  type StoredSubscription,
} from './store'

/**
 * Subscribe to the current user's stored subscription list, re-rendering
 * whenever any Status rumor is reconciled into the store.
 *
 * `userPubkey` can be `null` while the NIP-07 login is still resolving;
 * the hook returns an empty list in that case rather than throwing.
 */
export function useStoredSubscriptions(userPubkey: string | null): StoredSubscription[] {
  return useSyncExternalStore(
    (listener) => (userPubkey ? subscribeToChanges(userPubkey, listener) : noopUnsubscribe),
    () => (userPubkey ? listSubscriptions(userPubkey) : EMPTY_LIST),
    () => EMPTY_LIST,
  )
}

/**
 * Selects the user's active subscription pubkey for a given service id,
 * if any. Re-renders when the underlying store changes.
 */
export function useActiveSubscriptionForService(
  userPubkey: string | null,
  serviceId: string | null,
): StoredSubscription | null {
  return useSyncExternalStore(
    (listener) => (userPubkey ? subscribeToChanges(userPubkey, listener) : noopUnsubscribe),
    () =>
      userPubkey && serviceId
        ? findActiveSubscriptionForService(userPubkey, serviceId)
        : null,
    () => null,
  )
}

// `useSyncExternalStore`'s snapshot must be referentially stable across
// calls when nothing has changed; sharing module-level constants is the
// canonical way to satisfy that for empty/null returns.
const EMPTY_LIST: StoredSubscription[] = []
const noopUnsubscribe = () => {}
