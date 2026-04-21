import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchServiceAnnouncements, ServiceAnnouncement } from '../nostr/announcements'

interface UseServiceAnnouncementsResult {
  announcements: ServiceAnnouncement[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const CACHE_KEY = 'service_announcements'
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000 // 6 hours
const ANNOUNCEMENT_FETCH_TIMEOUT_MS = 10000
const SERVICES_API_RETRY_DELAYS_MS = [500, 1000, 2000, 4000]
const SERVICES_API_RECHECK_DELAY_MS = 15000

class ServiceRegistryUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServiceRegistryUnavailableError'
  }
}

interface ActiveService {
  serviceId: string
  pubkey: string
  healthy?: boolean
}

interface ServicesApiResponse {
  services?: ActiveService[]
}

interface CachedData {
  announcements: ServiceAnnouncement[]
  timestamp: number
  verifiedByRegistry: true
}

export function useServiceAnnouncements(): UseServiceAnnouncementsResult {
  const [announcements, setAnnouncements] = useState<ServiceAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadAnnouncements = useCallback(async (useCache = true): Promise<void> => {
    try {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }

      setLoading(true)
      setError(null)

      // Try to load from cache first
      if (useCache) {
        const cached = loadFromCache()
        if (cached && cached.length > 0) {
          console.log('Loaded', cached.length, 'announcements from cache')
          setAnnouncements(cached)
          setLoading(false)
          return
        }
      }

      console.log('Fetching service announcements from relays...')
      
      // Fetch from relays with timeout
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout fetching announcements')), ANNOUNCEMENT_FETCH_TIMEOUT_MS)
      )
      
      const fetchedAnnouncements = await Promise.race([
        fetchServiceAnnouncements(),
        timeoutPromise
      ])
      
      console.log('Fetched', fetchedAnnouncements.length, 'announcements')
      
      // Filter announcements by active services from orchestrator
      const activeAnnouncements = await filterActiveServices(fetchedAnnouncements)
      console.log('Filtered to', activeAnnouncements.length, 'active services')
      
      setAnnouncements(activeAnnouncements)
      
      // Save to cache
      saveToCache(activeAnnouncements)
    } catch (err) {
      console.error('Failed to fetch service announcements:', err)

      if (err instanceof ServiceRegistryUnavailableError) {
        setError('Service registry is temporarily unavailable. Waiting for /api/services to recover and retrying...')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch announcements')
        setAnnouncements([])
      }

      retryTimerRef.current = setTimeout(() => {
        void loadAnnouncements(false)
      }, SERVICES_API_RECHECK_DELAY_MS)
    } finally {
      setLoading(false)
    }
  }, [])

  const filterActiveServices = async (announcements: ServiceAnnouncement[]): Promise<ServiceAnnouncement[]> => {
    const services = await fetchActiveServicesWithRetry()

    const serviceMap = new Map<string, string>()
    services
      .filter(service => service.healthy)
      .forEach(service => {
        serviceMap.set(service.serviceId, service.pubkey)
      })

    console.log('Healthy services:', Array.from(serviceMap.entries()))
    console.log('Total announcements:', announcements.length)

    const filtered = announcements.filter(announcement => {
      const expectedPubkey = serviceMap.get(announcement.serviceId)
      if (!expectedPubkey) return false

      const matches = announcement.pubkey === expectedPubkey
      if (!matches) {
        console.warn(
          `Announcement for ${announcement.serviceId} has wrong pubkey: ${announcement.pubkey} (expected: ${expectedPubkey})`
        )
      }
      return matches
    })

    const deduped = new Map<string, ServiceAnnouncement>()
    filtered.forEach(announcement => {
      const existing = deduped.get(announcement.serviceId)
      if (!existing || announcement.timestamp > existing.timestamp) {
        deduped.set(announcement.serviceId, announcement)
      }
    })

    const result = Array.from(deduped.values())
    console.log('Filtered announcements:', result.length)

    return result
  }

  const refresh = async (): Promise<void> => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    await loadAnnouncements(false)
  }

  useEffect(() => {
    void loadAnnouncements()

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }
  }, [loadAnnouncements])

  return {
    announcements,
    loading,
    error,
    refresh
  }
}

function loadFromCache(): ServiceAnnouncement[] | null {
  if (typeof window === 'undefined') return null
  
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null

    const data: CachedData = JSON.parse(cached)

    if (!data.verifiedByRegistry) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }

    const age = Date.now() - data.timestamp

    if (age > CACHE_DURATION_MS) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }

    return data.announcements
  } catch {
    return null
  }
}

function saveToCache(announcements: ServiceAnnouncement[]): void {
  if (typeof window === 'undefined') return

  try {
    // Remove rawEvent to avoid circular references
    const serializableAnnouncements = announcements.map(announcement => {
      const serializableAnnouncement = { ...announcement } as Partial<ServiceAnnouncement>
      delete serializableAnnouncement.rawEvent
      return serializableAnnouncement as ServiceAnnouncement
    })
    const data: CachedData = {
      announcements: serializableAnnouncements as ServiceAnnouncement[],
      timestamp: Date.now(),
      verifiedByRegistry: true,
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch (err) {
    console.warn('Failed to cache announcements:', err)
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchActiveServicesWithRetry(): Promise<ActiveService[]> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= SERVICES_API_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch('/api/services', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`Service registry returned ${response.status}`)
      }

      const data = (await response.json()) as ServicesApiResponse
      return Array.isArray(data.services) ? data.services : []
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Failed to fetch /api/services')
      if (attempt < SERVICES_API_RETRY_DELAYS_MS.length) {
        await delay(SERVICES_API_RETRY_DELAYS_MS[attempt])
      }
    }
  }

  throw new ServiceRegistryUnavailableError(
    lastError?.message || 'Service registry is unavailable'
  )
}
