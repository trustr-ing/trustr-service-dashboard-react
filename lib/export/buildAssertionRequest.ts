import { NDKEvent } from '@nostr-dev-kit/ndk'
import { getNDK } from '@/lib/nostr/ndk'
import {
  ORCHESTRATOR_ASSERTIONS_PUBKEY,
  ORCHESTRATOR_ASSERTIONS_SERVICE_NADDR,
} from '@/lib/config'

const TSM_REQUEST_KIND = 37572
const TSM_SUBJECT_ASSERTIONS_KIND = 37575

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
  signingPubkey,
}: BuildAssertionRequestArgs): NDKEvent {
  if (!ORCHESTRATOR_ASSERTIONS_PUBKEY) {
    throw new Error(
      'ORCHESTRATOR_ASSERTIONS_PUBKEY is not configured. Set NEXT_PUBLIC_ASSERTIONS_PUBKEY.',
    )
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
    ['k', String(TSM_SUBJECT_ASSERTIONS_KIND)],
    ['p', pTagPubkey],
    ['a', ORCHESTRATOR_ASSERTIONS_SERVICE_NADDR],
    ['config', 'type', configType],
    ['config', 'pov', povNaddr],
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
