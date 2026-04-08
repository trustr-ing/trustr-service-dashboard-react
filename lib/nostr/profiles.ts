import { NDKUser } from '@nostr-dev-kit/ndk'
import { getNDK } from './ndk'

export interface NostrProfile {
  pubkey: string
  name?: string
  display_name?: string
  picture?: string
  about?: string
  nip05?: string
}

const profileCache = new Map<string, NostrProfile>()

export async function fetchProfile(pubkey: string): Promise<NostrProfile> {
  // Check cache first
  if (profileCache.has(pubkey)) {
    return profileCache.get(pubkey)!
  }

  try {
    const ndk = getNDK()
    await ndk.connect()

    const user = new NDKUser({ pubkey })
    user.ndk = ndk

    await user.fetchProfile()

    const profile: NostrProfile = {
      pubkey,
      name: user.profile?.name,
      display_name: user.profile?.displayName,
      picture: user.profile?.image,
      about: user.profile?.about,
      nip05: user.profile?.nip05,
    }

    profileCache.set(pubkey, profile)
    return profile
  } catch (err) {
    console.warn('Failed to fetch profile for', pubkey.slice(0, 8), err)
    const fallbackProfile: NostrProfile = { pubkey }
    profileCache.set(pubkey, fallbackProfile)
    return fallbackProfile
  }
}

export async function fetchProfiles(pubkeys: string[]): Promise<Map<string, NostrProfile>> {
  const profiles = new Map<string, NostrProfile>()
  
  // Fetch in parallel with a limit
  const batchSize = 10
  for (let i = 0; i < pubkeys.length; i += batchSize) {
    const batch = pubkeys.slice(i, i + batchSize)
    const results = await Promise.allSettled(
      batch.map(pubkey => fetchProfile(pubkey))
    )
    
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        profiles.set(batch[idx], result.value)
      } else {
        profiles.set(batch[idx], { pubkey: batch[idx] })
      }
    })
  }
  
  return profiles
}

export function getDisplayName(profile: NostrProfile): string {
  return profile.display_name || profile.name || `${profile.pubkey.slice(0, 8)}...`
}
