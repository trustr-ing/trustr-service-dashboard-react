import type { GiftWrapSigner, NostrEvent } from './giftWrap'

/**
 * NIP-07 surface published by browser-extension signers (Alby, nos2x,
 * Flamingo, etc). We type only the bits the gift-wrap helpers need —
 * the full NIP-07 surface is larger but not relevant here.
 */
interface Nip07Provider {
  getPublicKey(): Promise<string>
  signEvent(event: Omit<NostrEvent, 'id' | 'sig'>): Promise<NostrEvent>
  nip44?: {
    encrypt(recipientPubkey: string, plaintext: string): Promise<string>
    decrypt(senderPubkey: string, ciphertext: string): Promise<string>
  }
}

/**
 * Read `window.nostr` as a NIP-07 provider with NIP-44 support. We cast
 * locally rather than redeclaring the global because `nostr-tools` (and
 * other libs) publish their own narrower declaration of `window.nostr`
 * that conflicts with the shape we need.
 */
function readNip07Provider(): Nip07Provider | null {
  if (typeof window === 'undefined') return null
  const candidate = (window as unknown as { nostr?: Nip07Provider }).nostr
  return candidate ?? null
}

/**
 * Returns the user's NIP-07 provider wrapped as a `GiftWrapSigner`, or
 * `null` if either:
 *  - we're rendering on the server,
 *  - the user has no NIP-07 extension installed,
 *  - the installed extension does not implement NIP-44.
 *
 * The dashboard MUST surface a user-facing error when this returns `null`
 * because of missing NIP-44 — subscription messaging is not optional.
 */
export function getNip07GiftWrapSigner(): GiftWrapSigner | null {
  const provider = readNip07Provider()
  if (!provider) return null
  if (!provider.nip44) return null

  const nip44 = provider.nip44
  return {
    getPublicKey: () => provider.getPublicKey(),
    signEvent: (event) => provider.signEvent(event),
    nip44Encrypt: (recipientPubkey, plaintext) => nip44.encrypt(recipientPubkey, plaintext),
    nip44Decrypt: (senderPubkey, ciphertext) => nip44.decrypt(senderPubkey, ciphertext),
  }
}

/**
 * Feature-detect NIP-44 support on the installed extension. Used by the
 * UI to render a clear error before the user attempts to subscribe.
 *
 * Returns:
 *   - `'ok'` when a NIP-44-capable provider is present.
 *   - `'no-extension'` when `window.nostr` is missing.
 *   - `'no-nip44'` when the extension exists but lacks `nip44`.
 *   - `'ssr'` when called on the server.
 */
export type Nip07Capability = 'ok' | 'no-extension' | 'no-nip44' | 'ssr'

export function detectNip07Capability(): Nip07Capability {
  if (typeof window === 'undefined') return 'ssr'
  const provider = readNip07Provider()
  if (!provider) return 'no-extension'
  if (!provider.nip44) return 'no-nip44'
  return 'ok'
}
