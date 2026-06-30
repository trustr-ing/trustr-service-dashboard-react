/**
 * Browser-side subscription state.
 *
 * Each entry represents one orchestrator-issued subscription pubkey that
 * the logged-in user has been authorized to sign requests with. The state
 * is materialized from incoming kind-7570 Subscription Status rumors
 * (per tsm/subscription-events) — see `upsertFromStatusRumor` below.
 *
 * Persistence: localStorage, namespaced per user pubkey so a multi-account
 * browser session does not cross-contaminate.
 */

export type SubscriptionStatusValue =
  | 'active'
  | 'payment-required'
  | 'expired'
  | 'cancelled'
  | 'revoked'

export interface StoredSubscription {
  /** Orchestrator-issued pubkey the user signs requests with. */
  subscriptionPubkey: string
  /** Service ids this pubkey is authorized for. */
  allowedServices: string[]
  status: SubscriptionStatusValue
  /** Unix seconds. `null` = no expiration. `0` = revoked per spec convention. */
  expirationUnixSeconds: number | null
  /** Remaining quota. `null` = no quota. `0` = quota-exhausted per spec. */
  quotaRemaining: number | null
  /** Completed-request count reported by the provider. */
  usedCount: number
  /** Service announcement coordinate: `37570:<svc_pubkey>:<service_id>`. */
  serviceCoordinate: string
  /** When this state was last reconciled from a Status rumor (wall clock). */
  lastUpdatedAtMs: number
  /**
   * `created_at` of the rumor (NOT the outer wrap, whose timestamp is
   * jittered per NIP-59). Used to reject replays of older Status events
   * that would otherwise overwrite a newer cached state.
   */
  rumorCreatedAtSeconds: number
  /**
   * Pubkey that signed the kind-13 seal carrying the most recent Status.
   * Used to detect impersonation if a later update arrives signed by a
   * different pubkey than the one that originally provisioned us.
   */
  sealPubkey: string
}

/** Map of `subscriptionPubkey -> state` for a single user. */
type StoredSubscriptionMap = Record<string, StoredSubscription>

// ── Storage primitives ──────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = 'trustr:subscriptions:'

function storageKey(userPubkey: string): string {
  return `${STORAGE_KEY_PREFIX}${userPubkey}`
}

function readMap(userPubkey: string): StoredSubscriptionMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(storageKey(userPubkey))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return isStoredSubscriptionMap(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeMap(userPubkey: string, map: StoredSubscriptionMap): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(storageKey(userPubkey), JSON.stringify(map))
  notify(userPubkey)
}

// ── Change notification ─────────────────────────────────────────────────────

type Listener = () => void
const listeners = new Map<string, Set<Listener>>()

function notify(userPubkey: string): void {
  listeners.get(userPubkey)?.forEach(listener => listener())
}

export function subscribeToChanges(userPubkey: string, listener: Listener): () => void {
  let bucket = listeners.get(userPubkey)
  if (!bucket) {
    bucket = new Set()
    listeners.set(userPubkey, bucket)
  }
  bucket.add(listener)
  return () => {
    bucket?.delete(listener)
  }
}

// ── Read API ────────────────────────────────────────────────────────────────

export function listSubscriptions(userPubkey: string): StoredSubscription[] {
  return Object.values(readMap(userPubkey))
}

export function getSubscriptionByPubkey(
  userPubkey: string,
  subscriptionPubkey: string,
): StoredSubscription | null {
  return readMap(userPubkey)[subscriptionPubkey] ?? null
}

/**
 * Find an active subscription that authorizes the given service id.
 *
 * Active = `status === 'active'` AND (no expiration OR expiration > now)
 *          AND (no quota OR quotaRemaining > 0).
 *
 * Returns the first match. The dashboard issues one subscription pubkey
 * per user that gets extended with additional services over time, so in
 * practice there is at most one candidate.
 */
export function findActiveSubscriptionForService(
  userPubkey: string,
  serviceId: string,
): StoredSubscription | null {
  const now = Math.floor(Date.now() / 1000)
  for (const sub of Object.values(readMap(userPubkey))) {
    if (sub.status !== 'active') continue
    if (!sub.allowedServices.includes(serviceId)) continue
    if (sub.expirationUnixSeconds !== null && sub.expirationUnixSeconds <= now) continue
    if (sub.quotaRemaining !== null && sub.quotaRemaining <= 0) continue
    return sub
  }
  return null
}

// ── Write API ───────────────────────────────────────────────────────────────

/**
 * Reconcile a Subscription Status rumor (kind 7570) into local state.
 *
 * The rumor is expected to have already passed `unwrapEvent`'s three-way
 * provenance check; `sealPubkey` is the pubkey that signed the kind-13
 * seal (the service's announcement / messaging pubkey).
 *
 * Per tsm/subscription-events §Subscription Status Event, the rumor
 * carries:
 *   - exactly one `["a","37570:<svc_pubkey>:<service_id>",<relay?>]`
 *   - one or more `["p", <sub_pubkey>, <relay?>, <used>, <expiration?>, <quota?>]`
 *   - one `["status", <value>]`
 *
 * We materialize ONE store entry per `p` tag (each authorized pubkey),
 * sharing the same service coordinate + top-level status.
 *
 * @returns the list of subscriptionPubkeys that were upserted.
 */
export function upsertFromStatusRumor(
  userPubkey: string,
  rumor: { kind: number; created_at: number; tags: string[][] },
  sealPubkey: string,
): string[] {
  if (rumor.kind !== 7570) {
    throw new Error(`expected kind 7570 status rumor, got ${rumor.kind}`)
  }

  const aTag = rumor.tags.find(t => t[0] === 'a')
  if (!aTag?.[1]) {
    throw new Error('status rumor missing required `a` tag')
  }
  const serviceCoordinate = aTag[1]
  const { serviceId } = parseServiceCoordinate(serviceCoordinate)

  const statusTagValue = rumor.tags.find(t => t[0] === 'status')?.[1] ?? 'active'
  const status = normalizeStatusValue(statusTagValue)

  const now = Date.now()
  const map = readMap(userPubkey)
  const upserted: string[] = []

  for (const tag of rumor.tags) {
    if (tag[0] !== 'p' || !tag[1]) continue

    // Reject any update for a pubkey already provisioned by a DIFFERENT
    // seal pubkey — that would be a different service impersonating ours.
    const existing = map[tag[1]]
    if (existing && existing.sealPubkey !== sealPubkey) {
      console.warn(
        `[subscription:store] rejecting status for ${tag[1].slice(0, 8)}... — ` +
        `seal pubkey changed (${existing.sealPubkey.slice(0, 8)}... → ${sealPubkey.slice(0, 8)}...)`,
      )
      continue
    }

    // Replay guard: never let an older rumor overwrite a newer cached
    // state. Equal timestamps are accepted so that legitimate "same
    // moment" reissues (e.g. an immediate re-emit on retry) still apply.
    if (existing && rumor.created_at < existing.rumorCreatedAtSeconds) {
      continue
    }

    // Merge `serviceId` into `allowedServices` — the store is keyed by
    // subscription pubkey and a single pubkey may accumulate services
    // over multiple Status rumors.
    const prevAllowed = existing?.allowedServices ?? []
    const allowedServices = prevAllowed.includes(serviceId)
      ? prevAllowed
      : [...prevAllowed, serviceId]

    map[tag[1]] = {
      subscriptionPubkey: tag[1],
      allowedServices,
      status,
      expirationUnixSeconds: parsePositionalNumber(tag[4]),
      quotaRemaining: parsePositionalNumber(tag[5]),
      usedCount: parsePositionalNumber(tag[3]) ?? 0,
      serviceCoordinate,
      lastUpdatedAtMs: now,
      rumorCreatedAtSeconds: rumor.created_at,
      sealPubkey,
    }
    upserted.push(tag[1])
  }

  writeMap(userPubkey, map)
  return upserted
}

export function clearAll(userPubkey: string): void {
  writeMap(userPubkey, {})
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isStoredSubscriptionMap(value: unknown): value is StoredSubscriptionMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeStatusValue(raw: string): SubscriptionStatusValue {
  switch (raw) {
    case 'active':
    case 'payment-required':
    case 'expired':
    case 'cancelled':
    case 'revoked':
      return raw
    default:
      return 'active'
  }
}

interface ServiceCoordinate {
  serviceKind: string
  servicePubkey: string
  serviceId: string
}

function parseServiceCoordinate(coordinate: string): ServiceCoordinate {
  const parts = coordinate.split(':')
  if (parts.length < 3 || parts[0] !== '37570') {
    throw new Error(`malformed service coordinate: ${coordinate}`)
  }
  return {
    serviceKind: parts[0],
    servicePubkey: parts[1],
    serviceId: parts.slice(2).join(':'),
  }
}

function parsePositionalNumber(value: string | undefined): number | null {
  if (value === undefined || value === '') return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}
