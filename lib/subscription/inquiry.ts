import NDK, { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk'
import type { ServiceAnnouncement } from '../nostr/announcements'
import { wrapRumor, type GiftWrapSigner, type NostrEvent, type RumorTemplate } from './giftWrap'

/**
 * Recognized `["inquiry", …]` tag values per tsm/subscription-events.md
 * §Subscription Inquiry Event.
 */
export type InquiryIntent = 'inquire' | 'subscribe' | 'renew' | 'cancel' | 'pay'

export interface SendInquiryArgs {
  signer: GiftWrapSigner
  announcement: ServiceAnnouncement
  intent: InquiryIntent
  ndk: NDK
  /** Optional NIP-57 invoice payload, accompanies `intent === 'pay'`. */
  bolt11?: string
}

export interface SendInquiryResult {
  /** The signed kind-1059 gift wrap that was published. */
  wrap: NostrEvent
  /** Relays that ACKed the publish. */
  successfulRelays: string[]
  /** Relays that were attempted. */
  attemptedRelays: string[]
}

const SUBSCRIPTION_RUMOR_KIND = 7570

/**
 * Build, gift-wrap, and publish a Subscription Inquiry rumor.
 *
 * Throws if the announcement does not advertise kind-7570 messaging
 * support (i.e. has no `["p", _, _, "7570"]` tag). The caller is
 * responsible for surfacing that as a user-facing "service does not
 * support subscription" error.
 */
export async function sendInquiry(args: SendInquiryArgs): Promise<SendInquiryResult> {
  const { signer, announcement, intent, ndk, bolt11 } = args

  const messagingTarget = announcement.messagingTarget
  if (!messagingTarget) {
    throw new Error(
      `service ${announcement.serviceId} does not advertise kind-7570 messaging support`,
    )
  }

  const rumor = buildInquiryRumorTemplate(announcement, intent, bolt11)

  const wrap = await wrapRumor(signer, rumor, messagingTarget.pubkey, {
    outerKTag: SUBSCRIPTION_RUMOR_KIND,
  })

  const targetRelays = collectTargetRelays(announcement, messagingTarget.relayHint)
  const successfulRelays = await publishWrapToRelays(ndk, wrap, targetRelays)

  return {
    wrap,
    successfulRelays,
    attemptedRelays: targetRelays,
  }
}

// ── Rumor construction ──────────────────────────────────────────────────────

function buildInquiryRumorTemplate(
  announcement: ServiceAnnouncement,
  intent: InquiryIntent,
  bolt11: string | undefined,
): RumorTemplate {
  // Service coordinate per tsm-protocol §Service Announcements: a kind-37570
  // event is identified by `37570:<event_pubkey>:<d_tag>`. The `d` tag is
  // the service id and the event author is the service pubkey.
  const relayHint = announcement.relays[0]
  const aTag = relayHint
    ? ['a', `37570:${announcement.pubkey}:${announcement.serviceId}`, relayHint]
    : ['a', `37570:${announcement.pubkey}:${announcement.serviceId}`]

  const tags: string[][] = [
    aTag,
    ['inquiry', intent],
  ]

  if (intent === 'pay' && bolt11) {
    tags.push(['bolt11', bolt11])
  }

  return {
    kind: SUBSCRIPTION_RUMOR_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
  }
}

// ── Publish ─────────────────────────────────────────────────────────────────

function collectTargetRelays(
  announcement: ServiceAnnouncement,
  messagingRelayHint: string | null,
): string[] {
  // Prefer the messaging-specific relay hint; broadcast on the rest of
  // the announcement's relay set as a fallback so a single-relay outage
  // doesn't strand the inquiry.
  const ordered = messagingRelayHint
    ? [messagingRelayHint, ...announcement.relays]
    : [...announcement.relays]

  return Array.from(new Set(ordered.filter(url => url && url.length > 0)))
}

async function publishWrapToRelays(
  ndk: NDK,
  wrap: NostrEvent,
  relayUrls: string[],
): Promise<string[]> {
  if (relayUrls.length === 0) {
    throw new Error('no relays to publish gift wrap to')
  }

  // Reuse the existing NDK pool's connections where possible — NDK will
  // open new connections for relays not already in the pool.
  const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk)

  // NDKEvent will re-use the pre-computed id and signature; it does NOT
  // re-sign because the event arrives fully signed from `finalizeEvent`.
  const event = new NDKEvent(ndk, wrap)

  const publishedRelays = await event.publish(relaySet)
  return Array.from(publishedRelays).map(relay => relay.url)
}
