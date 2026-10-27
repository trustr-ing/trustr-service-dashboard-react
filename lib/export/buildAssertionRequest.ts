import { NDKEvent } from '@nostr-dev-kit/ndk'
import { getNDK } from '@/lib/nostr/ndk'
import {
  ORCHESTRATOR_ASSERTIONS_PUBKEY,
  ORCHESTRATOR_ASSERTIONS_SERVICE_NADDR,
} from '@/lib/config'

const TSM_REQUEST_KIND = 37572

export interface BuildAssertionRequestArgs {
  /** Naddr of the demo's kind-37573 output event (used as `config:pov`). */
  povNaddr: string
  /** Subject type letter from the source output (e.g. 'p' for Demo 1). */
  configType: string
  dTag: string
  title?: string
  /** Relay hints to include as `r` tags. */
  relayHints?: string[]
  /**
   * Output kinds the assertions service should yield. Emitted as one
   * `['k', <kind>]` tag per entry. Typical values: `[37575]` for
   * TSM-only or `[37575, 30382]` for TSM + NIP-85. Callers are
   * responsible for de-duplicating and ordering.
   */
  outputKinds: number[]
  /**
   * Inclusive `>=` rank cutoff forwarded to the service as
   * `['config','threshold', <n>]`. Values are formatted with fixed 4
   * decimal digits so relays / consumers see a stable canonical form.
   */
  threshold: number
  /**
   * Optional override for the request's `p` tag value. Pass the user's
   * active subscription pubkey when the assertions service is operating
   * in `subscription_service` mode (R3); leave undefined to address the
   * raw service pubkey (`public_service` mode).
   *
   * The `a` tag always remains the service coordinate so the orchestrator
   * can disambiguate which service the request is intended for.
   */
  signingPubkey?: string
}

/**
 * Build an unsigned TSM service request event (kind 37572) that targets the
 * orchestrator's assertions service. Expects `kind 37575` (TSM Subject
 * Assertions) outputs per the TSM Assertion Services spec.
 */
export function buildAssertionRequestEvent({
  povNaddr,
  configType,
  dTag,
  title,
  relayHints,
  outputKinds,
  threshold,
  signingPubkey,
}: BuildAssertionRequestArgs): NDKEvent {
  if (!ORCHESTRATOR_ASSERTIONS_PUBKEY) {
    throw new Error(
      'ORCHESTRATOR_ASSERTIONS_PUBKEY is not configured. Set NEXT_PUBLIC_ASSERTIONS_PUBKEY.',
    )
  }

  if (!outputKinds || outputKinds.length === 0) {
    throw new Error('buildAssertionRequestEvent: outputKinds must be non-empty')
  }

  const ndk = getNDK()
  const event = new NDKEvent(ndk)
  event.kind = TSM_REQUEST_KIND
  event.content = ''

  // The `p` tag tells the orchestrator which addressed pubkey to resolve.
  // For public_service mode this is the service's own pubkey; for
  // subscription_service mode (R3+) it's the user's subscription pubkey.
  // The `a` tag remains the service coordinate so KeyResolver can pick
  // the right ServiceRecord even when one subscription pubkey is
  // authorized for multiple services.
  const pTagPubkey = signingPubkey ?? ORCHESTRATOR_ASSERTIONS_PUBKEY

  const tags: string[][] = [
    ['d', dTag],
    ...outputKinds.map(kind => ['k', String(kind)]),
    ['p', pTagPubkey],
    ['a', ORCHESTRATOR_ASSERTIONS_SERVICE_NADDR],
    ['config', 'type', configType],
    ['config', 'pov', povNaddr],
    ['config', 'threshold', threshold.toFixed(4)],
  ]

  if (title && title.trim().length > 0) {
    tags.push(['title', title.trim()])
  }

  if (relayHints) {
    for (const url of relayHints) {
      if (url) tags.push(['r', url])
    }
  }

  event.tags = tags
  return event
}
