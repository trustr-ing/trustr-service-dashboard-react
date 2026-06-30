import {
  finalizeEvent,
  generateSecretKey,
  getEventHash,
} from 'nostr-tools/pure'
import { encrypt as nip44Encrypt, getConversationKey } from 'nostr-tools/nip44'

// ── Types ───────────────────────────────────────────────────────────────────

export interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export interface RumorTemplate {
  kind: number
  created_at: number
  tags: string[][]
  content: string
}

/** A NIP-59 rumor: an unsigned event with `id` and `pubkey` filled in. */
export interface SubscriptionRumor extends RumorTemplate {
  id: string
  pubkey: string
}

/**
 * Pluggable signer surface used by the gift-wrap helpers. NIP-07
 * (`window.nostr`) and NDK signers both satisfy this shape via thin
 * adapters — see `nip07Signer.ts`.
 *
 * The browser never sees the user's private key directly, so the user's
 * half of the seal step has to be delegated. The outer wrap step is done
 * locally with an ephemeral key and does not touch the signer.
 */
export interface GiftWrapSigner {
  getPublicKey(): Promise<string>
  signEvent(event: Omit<NostrEvent, 'id' | 'sig'>): Promise<NostrEvent>
  nip44Encrypt(recipientPubkey: string, plaintext: string): Promise<string>
  nip44Decrypt(senderPubkey: string, ciphertext: string): Promise<string>
}

// ── Constants ───────────────────────────────────────────────────────────────

const SEAL_KIND = 13
const GIFT_WRAP_KIND = 1059
// Two-day jitter window for wrap/seal timestamps per NIP-17/59.
const TIMESTAMP_JITTER_WINDOW_SECONDS = 2 * 24 * 60 * 60

// ── Wrap (outbound) ─────────────────────────────────────────────────────────

export interface WrapOptions {
  /**
   * Inner rumor kind. Used to add `["k", "<kind>"]` on the outer wrap so
   * recipients can filter their NIP-17 inbox by rumor kind (required for
   * TSM subscription events per tsm/subscription-events §Event Flow).
   */
  outerKTag?: string | number
}

/**
 * Build a NIP-59 gift-wrapped event from a rumor.
 *
 * Steps (in order, per NIP-59):
 *  1. Materialise the rumor with the signer's pubkey and a derived id.
 *  2. Build the kind-13 seal: signer NIP-44-encrypts the rumor JSON to
 *     the recipient, then signs the seal event with the user's identity.
 *  3. Build the kind-1059 outer wrap: a freshly-generated ephemeral key
 *     NIP-44-encrypts the seal JSON to the recipient and signs the wrap.
 *
 * The outer wrap is timestamp-jittered into a two-day past window so its
 * `created_at` leaks no ordering information about the underlying message.
 */
export async function wrapRumor(
  signer: GiftWrapSigner,
  rumorTemplate: RumorTemplate,
  recipientPubkey: string,
  options: WrapOptions = {},
): Promise<NostrEvent> {
  const senderPubkey = await signer.getPublicKey()

  // 1. Materialise the rumor — rumors have an id but no signature.
  const rumor: SubscriptionRumor = {
    ...rumorTemplate,
    pubkey: senderPubkey,
    id: '',
  }
  rumor.id = getEventHash(rumor)

  // 2. Seal: signer encrypts rumor JSON to recipient, then signs kind-13.
  const sealContent = await signer.nip44Encrypt(recipientPubkey, JSON.stringify(rumor))
  const seal = await signer.signEvent({
    kind: SEAL_KIND,
    created_at: jitteredTimestamp(),
    content: sealContent,
    tags: [],
    pubkey: senderPubkey,
  })

  // 3. Outer wrap: ephemeral key encrypts seal JSON to recipient and signs.
  const ephemeralPrivkey = generateSecretKey()
  const conversationKey = getConversationKey(ephemeralPrivkey, recipientPubkey)

  const outerTags: string[][] = [['p', recipientPubkey]]
  if (options.outerKTag !== undefined) {
    // tsm/subscription-events §Event Flow: outer wrap MUST include
    // ["k","7570"] for inbox filtering by rumor kind.
    outerTags.push(['k', String(options.outerKTag)])
  }

  return finalizeEvent(
    {
      kind: GIFT_WRAP_KIND,
      content: nip44Encrypt(JSON.stringify(seal), conversationKey),
      created_at: jitteredTimestamp(),
      tags: outerTags,
    },
    ephemeralPrivkey,
  )
}

// ── Unwrap (inbound) ────────────────────────────────────────────────────────

export interface UnwrappedRumor {
  rumor: SubscriptionRumor
  /**
   * Pubkey that signed the kind-13 seal. For an inbound Subscription Status
   * this is the service's announcement / messaging pubkey; for an inbound
   * Subscription Inquiry it would be the sender's user pubkey.
   *
   * Provenance equality `rumor.pubkey === sealPubkey` is enforced before
   * this is returned.
   */
  sealPubkey: string
}

/**
 * Unwrap a kind-1059 gift wrap whose intended recipient is the holder of
 * `signer`. Throws on any decryption / parse / kind / provenance failure.
 *
 * Caller MUST additionally verify that `wrap.tags` contains `["p", us]` —
 * this helper does not duplicate that check because the relay-side filter
 * already enforces it.
 */
export async function unwrapEvent(
  signer: GiftWrapSigner,
  wrap: NostrEvent,
): Promise<UnwrappedRumor> {
  if (wrap.kind !== GIFT_WRAP_KIND) {
    throw new Error(`expected kind ${GIFT_WRAP_KIND} gift wrap, got ${wrap.kind}`)
  }

  // The outer wrap is encrypted by an ephemeral key whose pubkey IS the
  // wrap event's `pubkey`. We decrypt with the signer's privkey against
  // that ephemeral pubkey to recover the seal JSON.
  const sealJson = await signer.nip44Decrypt(wrap.pubkey, wrap.content)
  const seal = parseJsonEvent(sealJson, 'seal')

  if (seal.kind !== SEAL_KIND) {
    throw new Error(`expected seal kind ${SEAL_KIND}, got ${seal.kind}`)
  }

  const rumorJson = await signer.nip44Decrypt(seal.pubkey, seal.content)
  const parsedRumor = parseJsonEvent(rumorJson, 'rumor')

  // tsm/subscription-events §Security: three-way provenance check.
  if (parsedRumor.pubkey !== seal.pubkey) {
    throw new Error(
      `provenance mismatch: rumor.pubkey ${parsedRumor.pubkey.slice(0, 8)}... ` +
      `!== seal.pubkey ${seal.pubkey.slice(0, 8)}...`,
    )
  }

  // Rumors omit `sig`; drop it from the parsed event before returning.
  const rumorWithoutSig: SubscriptionRumor = {
    id: parsedRumor.id,
    pubkey: parsedRumor.pubkey,
    created_at: parsedRumor.created_at,
    kind: parsedRumor.kind,
    tags: parsedRumor.tags,
    content: parsedRumor.content,
  }
  return {
    rumor: rumorWithoutSig,
    sealPubkey: seal.pubkey,
  }
}

// ── Internal helpers ────────────────────────────────────────────────────────

function jitteredTimestamp(): number {
  const nowSeconds = Math.floor(Date.now() / 1000)
  return nowSeconds - Math.floor(Math.random() * TIMESTAMP_JITTER_WINDOW_SECONDS)
}

function parseJsonEvent(json: string, label: string): NostrEvent {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new Error(`failed to parse ${label} JSON: ${(err as Error).message}`)
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as NostrEvent).kind !== 'number' ||
    typeof (parsed as NostrEvent).pubkey !== 'string' ||
    typeof (parsed as NostrEvent).content !== 'string' ||
    !Array.isArray((parsed as NostrEvent).tags)
  ) {
    throw new Error(`${label} is not a valid Nostr event shape`)
  }
  return parsed as NostrEvent
}
