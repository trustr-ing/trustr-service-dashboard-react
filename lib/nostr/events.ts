import { NDKEvent } from '@nostr-dev-kit/ndk'
import { getNDK } from './ndk'
import { extractRelayHintsFromEvent } from './naddr'

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
  // Prefer explicit request markers, but gracefully handle outputs/feedback that
  // include unmarked or differently-marked e-tags.
  const eTags = event.tags.filter((tag) => tag[0] === 'e' && Boolean(tag[1]))
  if (eTags.length === 0) return null

  const requestTaggedReference = eTags.find((tag) => tag[3] === 'request')?.[1]
  if (requestTaggedReference) return requestTaggedReference

  const unmarkedReference = eTags.find((tag) => !tag[3])?.[1]
  if (unmarkedReference) return unmarkedReference

  return eTags[0]?.[1] || null
}

export function isTerminalSuccessFeedback(
  status: string | null | undefined,
  message: string | null | undefined,
): boolean {
  // Require explicit success status first, then allow common terminal wording
  // variants emitted by different service implementations.
  if ((status ?? '').toLowerCase() !== 'success') return false

  const normalizedMessage = (message ?? '').toLowerCase()
  if (!normalizedMessage) return true

  return (
    normalizedMessage.includes('complete') ||
    normalizedMessage.includes('finished') ||
    normalizedMessage.includes('done')
  )
}

export function getFeedbackStatus(event: NDKEvent): string | null {
  const statusTag = event.tags.find((t) => t[0] === 'status')
  return statusTag ? statusTag[1] : null
}

export function getFeedbackMessage(event: NDKEvent): string {
  const statusTag = event.tags.find((t) => t[0] === 'status')
  const statusMessage = statusTag?.[2]?.trim()

  if (statusMessage) return statusMessage
  return event.content
}

export function getFeedbackProgress(event: NDKEvent): number | null {
  const progressTag = event.tags.find((t) => t[0] === 'progress')
  if (!progressTag?.[1]) return null

  const parsed = parseInt(progressTag[1], 10)
  if (Number.isNaN(parsed)) return null

  return Math.max(0, Math.min(100, parsed))
}

export interface ParsedFeedbackEvent {
  id: string
  requestEventId: string | null
  status: string | null
  message: string
  progress: number | null
  timestamp: number
}

export function parseFeedbackEvent(event: NDKEvent): ParsedFeedbackEvent {
  return {
    id: event.id,
    requestEventId: getRequestEventId(event),
    status: getFeedbackStatus(event),
    message: getFeedbackMessage(event),
    progress: getFeedbackProgress(event),
    timestamp: event.created_at || 0,
  }
}

export interface ParsedOutputEvent {
  id: string
  requestEventId: string | null
  content: string
  data: Record<string, unknown>
  tags: string[][]
  relayHints: string[]
  timestamp: number
  pubkey: string
  kind: number
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
    relayHints: extractRelayHintsFromEvent(event),
    timestamp: event.created_at || 0,
    pubkey: event.pubkey,
    kind: event.kind || 37573,
  }
}
