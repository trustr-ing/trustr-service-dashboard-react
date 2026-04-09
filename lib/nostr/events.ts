import { NDKEvent } from '@nostr-dev-kit/ndk'
import { getNDK } from './ndk'

export interface ServiceRequestConfig {
  title?: string
  pov: string
  type: string
  minrank?: string
  attenuation?: string
  rigor?: string
  precision?: string
  interpreters?: string
  [key: string]: string | undefined
}

export function buildServiceRequestEvent(
  serviceId: string,
  servicePubkey: string,
  config: ServiceRequestConfig,
  outputKind: number = 37573,
  dTag?: string
): NDKEvent {
  const ndk = getNDK()
  const event = new NDKEvent(ndk)
  
  event.kind = 37572
  event.content = ''
  
  const requestDTag = dTag || `${serviceId}-${Date.now()}`
  
  event.tags = [
    ['d', requestDTag],
    ['p', servicePubkey],
    ['k', String(outputKind)],
  ]
  
  // Add title as separate tag if provided
  if (config.title) {
    event.tags.push(['title', config.title])
  }
  
  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined && value !== '' && key !== 'title') {
      event.tags.push(['config', key, value])
    }
  }
  
  return event
}

export function parseServiceRequestEvent(event: NDKEvent): {
  serviceId: string
  servicePubkey: string
  config: ServiceRequestConfig
  outputKind: number
} {
  const pTag = event.tags.find((t) => t[0] === 'p')
  const kTag = event.tags.find((t) => t[0] === 'k')
  const dTag = event.tags.find((t) => t[0] === 'd')
  
  if (!pTag || !pTag[1]) {
    throw new Error('Missing p tag')
  }
  
  const servicePubkey = pTag[1]
  const outputKind = kTag ? parseInt(kTag[1]) : 37573
  const serviceId = dTag ? dTag[1] : ''
  
  const config: ServiceRequestConfig = {
    pov: '',
    type: '',
  }
  
  event.tags
    .filter((t) => t[0] === 'config' && t[1] && t[2])
    .forEach((t) => {
      config[t[1]] = t[2]
    })
  
  return {
    serviceId,
    servicePubkey,
    config,
    outputKind,
  }
}

export function isFeedbackEvent(event: NDKEvent): boolean {
  return event.kind === 7000
}

export function isOutputEvent(event: NDKEvent): boolean {
  return event.kind === 37573
}

export function getRequestEventId(event: NDKEvent): string | null {
  const eTag = event.tags.find((t) => t[0] === 'e' && t[3] === 'request')
  return eTag ? eTag[1] : null
}

export function getFeedbackStatus(event: NDKEvent): string | null {
  const statusTag = event.tags.find((t) => t[0] === 'status')
  return statusTag ? statusTag[1] : null
}

export interface ParsedFeedbackEvent {
  id: string
  requestEventId: string | null
  status: string | null
  message: string
  timestamp: number
}

export function parseFeedbackEvent(event: NDKEvent): ParsedFeedbackEvent {
  return {
    id: event.id,
    requestEventId: getRequestEventId(event),
    status: getFeedbackStatus(event),
    message: event.content,
    timestamp: event.created_at || 0,
  }
}

export interface ParsedOutputEvent {
  id: string
  requestEventId: string | null
  content: string
  data: Record<string, unknown>
  tags: string[][]
  timestamp: number
}

export function parseOutputEvent(event: NDKEvent): ParsedOutputEvent {
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(event.content)
  } catch {
    data = { raw: event.content }
  }

  return {
    id: event.id,
    requestEventId: getRequestEventId(event),
    content: event.content,
    data,
    tags: event.tags,
    timestamp: event.created_at || 0,
  }
}
