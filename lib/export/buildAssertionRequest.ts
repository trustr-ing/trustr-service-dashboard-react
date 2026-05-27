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

  const tags: string[][] = [
    ['d', dTag],
    ['k', String(TSM_SUBJECT_ASSERTIONS_KIND)],
    ['p', ORCHESTRATOR_ASSERTIONS_PUBKEY],
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
