import NDK, { NDKEvent, NDKNip07Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'

const DEFAULT_RELAYS = [
  'wss://relay.trustr.ing',
  'wss://relay.primal.net',
  'wss://nos.lol',
]

/**
 * How long connectNDK waits for relays before proceeding with whatever is
 * connected. NDK's untimed `connect()` resolves only once EVERY relay in
 * the pool is connected, so a single unreachable relay would hang every
 * caller forever; the dashboard must never wait on all relays.
 */
const CONNECT_TIMEOUT_MS = 4000

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

/**
 * Ensure the shared NDK instance has started connecting and give relays a
 * bounded time to come up. Returns as soon as any relay is connected, or
 * after the timeout; NDK keeps connecting in the background and delivers
 * to relays as they come up. Never waits for every relay.
 */
export async function connectNDK(timeoutMs: number = CONNECT_TIMEOUT_MS): Promise<NDK> {
  const ndk = getNDK()
  if (ndk.pool?.connectedRelays().length) return ndk
  await ndk.connect(timeoutMs)
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
