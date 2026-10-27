import NDK, {
  NDKEvent,
  NDKNip07Signer,
  NDKPrivateKeySigner,
  NDKRelaySet,
  NDKRelayStatus,
  type NDKFilter,
  type NDKRelay,
  type NDKSubscription,
} from '@nostr-dev-kit/ndk'

const DEFAULT_RELAYS = [
  'wss://relay.trustr.ing',
  'wss://relay.primal.net',
  'wss://nos.lol',
]

/**
 * Extra relays consulted for kind-0 profile lookups only. These are
 * profile aggregators / indexers: read from them, never publish to them.
 */
export const PROFILE_READ_RELAYS = [
  ...DEFAULT_RELAYS,
  'wss://purplepag.es',
  'wss://relay.nostr.band',
]

/**
 * Extra relays consulted when resolving ranked event references. The
 * semantic service's corpus includes Mastodon-bridged posts that only the
 * Mostr bridge carries. Its advertised address, relay.mostr.pub, answers
 * with a redirect to relay.ditto.pub, which browser WebSockets do not
 * follow, so the final address is used. Read only.
 */
export const EVENT_READ_RELAYS = [
  ...DEFAULT_RELAYS,
  'wss://relay.ditto.pub',
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

/** How long to give a relay that was just added to the pool to connect. */
const NEW_RELAY_CONNECT_WAIT_MS = 3000

/**
 * Build a relay set from `urls`, adding any relay missing from the pool.
 * NDK signals end-of-stream from the relays connected at subscribe time,
 * so a relay added a moment ago would be skipped silently; newly added
 * relays therefore get a bounded wait to connect before the set is used.
 * Unreachable relays cost at most that wait once, then nothing.
 */
export async function relaySetFor(ndk: NDK, urls: string[]): Promise<NDKRelaySet> {
  const added: NDKRelay[] = []
  for (const url of urls) {
    if (!ndk.pool.getRelay(url, false)) {
      try {
        added.push(ndk.addExplicitRelay(url, undefined, true))
      } catch (err) {
        console.warn('[ndk] failed to add relay', url, err)
      }
    }
  }
  const pending = added.filter(relay => relay.status !== NDKRelayStatus.CONNECTED)
  if (pending.length > 0) {
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, NEW_RELAY_CONNECT_WAIT_MS)
      let remaining = pending.length
      for (const relay of pending) {
        relay.once('connect', () => {
          remaining -= 1
          if (remaining === 0) {
            clearTimeout(timer)
            resolve()
          }
        })
      }
    })
  }
  return NDKRelaySet.fromRelayUrls(urls, ndk, true)
}

/**
 * Run a one-shot subscription and resolve with every event received by the
 * time all relays signalled end-of-stream, or by `timeoutMs`, whichever is
 * first. Unlike `ndk.fetchEvents`, a relay that never connects or never
 * answers cannot make us lose what the others already delivered.
 */
export async function collectEvents(
  ndk: NDK,
  filter: NDKFilter,
  relaySet: NDKRelaySet | undefined,
  timeoutMs: number,
): Promise<NDKEvent[]> {
  return new Promise(resolve => {
    const events = new Map<string, NDKEvent>()
    let settled = false
    let subscription: NDKSubscription | undefined
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { subscription?.stop() } catch { /* ignore */ }
      resolve(Array.from(events.values()))
    }
    const timer = setTimeout(finish, timeoutMs)
    try {
      subscription = ndk.subscribe(filter, { closeOnEose: true, groupable: false, relaySet }, false)
      subscription.on('event', (event: NDKEvent) => {
        if (event.id) events.set(event.id, event)
      })
      subscription.on('eose', finish)
      subscription.start()
    } catch (err) {
      console.warn('[ndk] subscription failed', err)
      finish()
    }
  })
}
