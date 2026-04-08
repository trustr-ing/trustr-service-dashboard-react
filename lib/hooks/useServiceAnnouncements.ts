import { useEffect, useState } from 'react'
import { fetchServiceAnnouncements, ServiceAnnouncement } from '../nostr/announcements'

interface UseServiceAnnouncementsResult {
  announcements: ServiceAnnouncement[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const CACHE_KEY = 'service_announcements'
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000 // 6 hours

interface CachedData {
  announcements: ServiceAnnouncement[]
  timestamp: number
}

export function useServiceAnnouncements(): UseServiceAnnouncementsResult {
  const [announcements, setAnnouncements] = useState<ServiceAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAnnouncements = async (useCache = true): Promise<void> => {
    try {
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
        setTimeout(() => reject(new Error('Timeout fetching announcements')), 10000)
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
      setError(err instanceof Error ? err.message : 'Failed to fetch announcements')
      setAnnouncements([])
    } finally {
      setLoading(false)
    }
  }

  const filterActiveServices = async (announcements: ServiceAnnouncement[]): Promise<ServiceAnnouncement[]> => {
    try {
      const response = await fetch('http://167.99.181.211:3002/services')
      if (!response.ok) {
        console.warn('Failed to fetch active services, showing all announcements')
        return announcements
      }
      
      const data = await response.json()
      const healthyServiceIds = data.services
        .filter((s: { healthy: boolean }) => s.healthy)
        .map((s: { serviceId: string }) => s.serviceId)
      
      return announcements.filter(a => healthyServiceIds.includes(a.serviceId))
    } catch (err) {
      console.warn('Error filtering services, showing all announcements:', err)
      return announcements
    }
  }

  const refresh = async (): Promise<void> => {
    await loadAnnouncements(false)
  }

  useEffect(() => {
    loadAnnouncements()
  }, [])

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
    const data: CachedData = {
      announcements,
      timestamp: Date.now()
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch (err) {
    console.warn('Failed to cache announcements:', err)
  }
}
