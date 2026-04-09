import NDK, { NDKEvent, NDKNip07Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'

const DEFAULT_RELAYS = [
  'wss://relay.trustr.ing',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
]

let ndkInstance: NDK | null = null

export function getNDK(): NDK {
  if (!ndkInstance) {
    console.log('Initializing NDK with relays:', DEFAULT_RELAYS)
    ndkInstance = new NDK({
      explicitRelayUrls: DEFAULT_RELAYS,
      enableOutboxModel: false,
      autoConnectUserRelays: false,
    })
  }
  return ndkInstance
}

export async function connectNDK(): Promise<NDK> {
  const ndk = getNDK()
  if (!ndk.pool?.connectedRelays().length) {
    await ndk.connect()
  }
  return ndk
}

export async function getNip07Signer(): Promise<NDKNip07Signer | null> {
  if (typeof window === 'undefined') return null
  if (!window.nostr) return null
  
  const signer = new NDKNip07Signer()
  return signer
}

export function createPrivateKeySigner(privateKey: string): NDKPrivateKeySigner {
  return new NDKPrivateKeySigner(privateKey)
}

export async function publishEvent(event: NDKEvent): Promise<void> {
  await connectNDK()
  await event.publish()
}

export { NDKEvent }
