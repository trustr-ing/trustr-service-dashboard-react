/**
 * Dashboard-level configuration constants.
 *
 * The orchestrator's TSM Assertions service pubkey is hardcoded for now;
 * once the orchestrator publishes a kind-37570 announcement for it, this
 * should be replaced with announcement-based discovery via
 * `useServiceAnnouncements`.
 */

const PLACEHOLDER_ASSERTIONS_PUBKEY = ''

export const ORCHESTRATOR_ASSERTIONS_PUBKEY: string =
  process.env.NEXT_PUBLIC_ASSERTIONS_PUBKEY ?? PLACEHOLDER_ASSERTIONS_PUBKEY

export const ORCHESTRATOR_ASSERTIONS_SERVICE_ID = 'assertions'

export const ORCHESTRATOR_ASSERTIONS_SERVICE_NADDR = ORCHESTRATOR_ASSERTIONS_PUBKEY
  ? `37570:${ORCHESTRATOR_ASSERTIONS_PUBKEY}:${ORCHESTRATOR_ASSERTIONS_SERVICE_ID}`
  : ''

export const TRUSTR_RELAY_URL = 'wss://relay.trustr.ing'
