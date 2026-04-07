import { nip19, generateSecretKey, getPublicKey } from 'nostr-tools'

export function hexToNpub(hex: string): string {
  return nip19.npubEncode(hex)
}

export function npubToHex(npub: string): string {
  const decoded = nip19.decode(npub)
  if (decoded.type !== 'npub') {
    throw new Error('Invalid npub')
  }
  return decoded.data
}

export function hexToNsec(hex: string): string {
  return nip19.nsecEncode(Buffer.from(hex, 'hex'))
}

export function nsecToHex(nsec: string): string {
  const decoded = nip19.decode(nsec)
  if (decoded.type !== 'nsec') {
    throw new Error('Invalid nsec')
  }
  return Buffer.from(decoded.data).toString('hex')
}

export function generateKeypair(): { pubkey: string; privkey: string; npub: string; nsec: string } {
  const privkeyBytes = generateSecretKey()
  const privkey = Buffer.from(privkeyBytes).toString('hex')
  const pubkeyBytes = getPublicKey(privkeyBytes)
  const pubkey = Buffer.from(pubkeyBytes).toString('hex')
  
  return {
    pubkey,
    privkey,
    npub: hexToNpub(pubkey),
    nsec: hexToNsec(privkey),
  }
}

export function getPubkeyFromPrivkey(privkey: string): string {
  const pubkeyBytes = getPublicKey(Buffer.from(privkey, 'hex'))
  return Buffer.from(pubkeyBytes).toString('hex')
}
