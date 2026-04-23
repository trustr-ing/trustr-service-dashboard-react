import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk'
import { getNDK } from './ndk'

export interface ServiceConfig {
  key: string
  valueType: string
  description: string
  defaultValue?: string
  allowedValues?: string
}

export interface ServiceOption {
  key: string
  valueType: string
  description: string
  defaultValue?: string
}

export interface ServiceAnnouncement {
  id: string
  pubkey: string
  serviceId: string
  title: string
  summary: string
  outputKind: number
  relays: string[]
  configs: ServiceConfig[]
  options: ServiceOption[]
  customFields: Record<string, string>
  timestamp: number
  rawEvent?: NDKEvent
}

export async function fetchServiceAnnouncements(): Promise<ServiceAnnouncement[]> {
  const ndk = getNDK()
  
  // Connect to relays first
  try {
    await ndk.connect()
  } catch (err) {
    console.error('Failed to connect to relays:', err)
    throw new Error('Failed to connect to Nostr relays')
  }
  
  const filter: NDKFilter = {
    kinds: [37570 as number],
    limit: 50
  }

  const events = await ndk.fetchEvents(filter)
  const announcements: ServiceAnnouncement[] = []

  for (const event of events) {
    try {
      const announcement = parseAnnouncementEvent(event)
      announcements.push(announcement)
    } catch (err) {
      console.warn('Failed to parse announcement event:', event.id, err)
    }
  }

  return announcements.sort((a, b) => b.timestamp - a.timestamp)
}

export function parseAnnouncementEvent(event: NDKEvent): ServiceAnnouncement {
  const tags = event.tags || []
  
  const dTag = tags.find(t => t[0] === 'd')
  const pTag = tags.find(t => t[0] === 'p')
  const titleTag = tags.find(t => t[0] === 'title')
  const summaryTag = tags.find(t => t[0] === 'summary')
  const kTag = tags.find(t => t[0] === 'k')
  
  if (!dTag || !dTag[1]) {
    throw new Error('Announcement missing required d tag')
  }
  
  if (!pTag || !pTag[1]) {
    throw new Error('Announcement missing required p tag')
  }

  const serviceId = dTag[1]
  const pubkey = pTag[1]
  const title = titleTag?.[1] || serviceId
  const summary = summaryTag?.[1] || ''
  const outputKind = kTag?.[1] ? parseInt(kTag[1]) : 37573

  const relays = tags
    .filter(t => t[0] === 'r' && t[1])
    .map(t => t[1])

  const configs: ServiceConfig[] = tags
    .filter(t => t[0] === 'config' && t[1])
    .map(t => ({
      key: t[1],
      valueType: t[2] || 'string',
      description: t[3] || '',
      defaultValue: t[4],
      allowedValues: t[5]
    }))

  const options: ServiceOption[] = tags
    .filter(t => t[0] === 'option' && t[1])
    .map(t => ({
      key: t[1],
      valueType: t[2] || 'string',
      description: t[3] || '',
      defaultValue: t[4]
    }))

  const customFields: Record<string, string> = {}
  tags
    .filter(t => t[0] === 'info' && t[1] && t[2])
    .forEach(t => {
      customFields[t[1]] = t[2]
    })

  return {
    id: event.id,
    pubkey,
    serviceId,
    title,
    summary,
    outputKind,
    relays,
    configs,
    options,
    customFields,
    timestamp: event.created_at || 0,
    rawEvent: event
  }
}

export function getConfigByKey(announcement: ServiceAnnouncement, key: string): ServiceConfig | undefined {
  return announcement.configs.find(c => c.key === key)
}

export function getOptionByKey(announcement: ServiceAnnouncement, key: string): ServiceOption | undefined {
  return announcement.options.find(o => o.key === key)
}

export function getAllowedValuesArray(config: ServiceConfig): string[] {
  if (!config.allowedValues) return []
  try {
    const parsed = JSON.parse(config.allowedValues)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
