'use client'

import { useCallback, useEffect, useState } from 'react'
import { NDKRelaySet } from '@nostr-dev-kit/ndk'
import { connectNDK, getNDK, getNip07Signer } from '@/lib/nostr/ndk'
import { buildOutputEventNaddr } from '@/lib/nostr/naddr'
import { isTerminalSuccessFeedback } from '@/lib/nostr/events'
import {
  assertValidDemoRequestShape,
  buildBaselineWotEvent,
  buildEngagementRankEvent,
  buildSemanticSearchEvent,
  baselineConfigForDb,
  engagementConfigForDb,
  semanticConfigForDb,
  PRESET_BASELINE,
  PRESET_ENGAGEMENT,
  PRESET_SEMANTIC,
  RankKind,
  SavedConfigData,
} from '@/lib/demo/presets'
import { useRequestMonitor } from './useRequestMonitor'

type StepStatus = 'idle' | 'publishing' | 'running' | 'completed' | 'error'

interface StepState {
  eventId: string | null
  savedRequestId: number | null
  naddr: string | null
  status: StepStatus
  error: string | null
}

interface SemanticStepState extends StepState {
  rankKind: RankKind
  context: string
}

const IDLE_STEP: StepState = {
  eventId: null,
  savedRequestId: null,
  naddr: null,
  status: 'idle',
  error: null,
}

interface ApiSavedRequest {
  id: number
  eventId: string
  status: string
  configData: string
  firstOutputNaddr: string | null
  publishedAt: string
  completedAt: string | null
}

const REQUEST_PUBLISH_TIMEOUT_MS = 15_000
const REQUEST_PUBLISH_MAX_ATTEMPTS = 2

async function publishRequestEvent(event: import('@nostr-dev-kit/ndk').NDKEvent): Promise<void> {
  const ndk = await connectNDK()
  const relayUrls = ndk.explicitRelayUrls ?? []
  const relaySet = relayUrls.length > 0
    ? NDKRelaySet.fromRelayUrls(relayUrls, ndk, true)
    : undefined

  let lastError: unknown = null

  for (let attempt = 1; attempt <= REQUEST_PUBLISH_MAX_ATTEMPTS; attempt += 1) {
    try {
      await event.publish(relaySet, REQUEST_PUBLISH_TIMEOUT_MS, 1)
      return
    } catch (error) {
      lastError = error
      if (attempt < REQUEST_PUBLISH_MAX_ATTEMPTS) {
        await ndk.connect()
      }
    }
  }

  if (lastError instanceof Error) {
    throw new Error(`Failed to publish request event: ${lastError.message}`)
  }

  throw new Error('Failed to publish request event')
}

export interface DemoPipeline {
  userPubkey: string | null
  baseline: StepState
  semantic: SemanticStepState
  engagement: StepState
  baselineMonitor: ReturnType<typeof useRequestMonitor>
  semanticMonitor: ReturnType<typeof useRequestMonitor>
  engagementMonitor: ReturnType<typeof useRequestMonitor>
  submitBaseline: () => Promise<void>
  submitSemantic: (context: string, rankKind: RankKind) => Promise<void>
  submitEngagement: (weights: { zap: number }) => Promise<void>
  cancelBaseline: () => void
  cancelSemantic: () => void
  cancelEngagement: () => void
}

async function publishAndSave(
  event: import('@nostr-dev-kit/ndk').NDKEvent,
  signer: import('@nostr-dev-kit/ndk').NDKNip07Signer,
  configData: SavedConfigData,
): Promise<{ eventId: string; savedRequestId: number }> {
  // Enforce demo request guardrails before signing or sending malformed events.
  assertValidDemoRequestShape(event)

  await event.sign(signer)
  await publishRequestEvent(event)

  const res = await fetch('/api/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId: event.id, configData }),
  })

  if (!res.ok) {
    throw new Error(`Failed to save request (${res.status})`)
  }

  const data = await res.json()
  return { eventId: event.id, savedRequestId: data.savedRequest.id }
}

function parsePresetFromRow(row: ApiSavedRequest): SavedConfigData | null {
  try {
    const parsed = JSON.parse(row.configData)
    if (parsed && typeof parsed.preset === 'string') return parsed as SavedConfigData
  } catch {}
  return null
}

function getLatestPresetRequest(rows: ApiSavedRequest[], preset: string): ApiSavedRequest | undefined {
  return rows.find((row) => parsePresetFromRow(row)?.preset === preset)
}

function mapSavedRequestToStepState(row: ApiSavedRequest): StepState {
  const normalizedStatus = row.status.toLowerCase()
  const isCompleted = normalizedStatus === 'completed' && Boolean(row.firstOutputNaddr)

  return {
    eventId: row.eventId,
    savedRequestId: row.id,
    naddr: isCompleted ? row.firstOutputNaddr : null,
    status: isCompleted
      ? 'completed'
      : normalizedStatus === 'error'
        ? 'error'
        : 'running',
    error: null,
  }
}

export function useDemoPipeline(
  graperankPubkey: string | null,
  semanticPubkey: string | null,
): DemoPipeline {
  const [userPubkey, setUserPubkey] = useState<string | null>(null)

  const [baseline, setBaseline] = useState<StepState>(IDLE_STEP)
  const [semantic, setSemantic] = useState<SemanticStepState>({
    ...IDLE_STEP,
    rankKind: '1',
    context: '',
  })
  const [engagement, setEngagement] = useState<StepState>(IDLE_STEP)

  const baselineMonitor = useRequestMonitor(baseline.eventId)
  const semanticMonitor = useRequestMonitor(semantic.eventId)
  const engagementMonitor = useRequestMonitor(engagement.eventId)

  // Resolve user pubkey from the NIP-07 signer
  useEffect(() => {
    void (async () => {
      try {
        const signer = await getNip07Signer()
        if (!signer) return
        const user = await signer.user()
        if (user.pubkey) setUserPubkey(user.pubkey)
      } catch (err) {
        console.error('[demo] failed to resolve user pubkey:', err)
      }
    })()
  }, [])

  // Rehydrate from prior runs (completed and in-flight)
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/requests')
        if (!res.ok) return
        const data = await res.json()
        const rows: ApiSavedRequest[] = data.requests || []

        const base = getLatestPresetRequest(rows, PRESET_BASELINE)
        if (base) {
          setBaseline(mapSavedRequestToStepState(base))
        }

        const sem = getLatestPresetRequest(rows, PRESET_SEMANTIC)
        if (sem) {
          const cfg = parsePresetFromRow(sem)
          const rk = (cfg?.rankKind === '30023' ? '30023' : '1') as RankKind
          const context = typeof cfg?.context === 'string' ? cfg.context : ''
          const restoredSemantic = mapSavedRequestToStepState(sem)
          setSemantic({
            ...restoredSemantic,
            rankKind: rk,
            context,
          })
        }

        const eng = getLatestPresetRequest(rows, PRESET_ENGAGEMENT)
        if (eng) {
          setEngagement(mapSavedRequestToStepState(eng))
        }
      } catch (err) {
        console.error('[demo] rehydration failed:', err)
      }
    })()
  }, [])

  // Watch each monitor and transition to completed/error when signals arrive
  useCompletionWatcher(baseline, baselineMonitor, setBaseline)
  useCompletionWatcher(semantic, semanticMonitor, (updater) => {
    if (typeof updater === 'function') {
      setSemantic(prev => ({
        ...updater(prev),
        rankKind: prev.rankKind,
        context: prev.context,
      }))
    } else {
      setSemantic(prev => ({
        ...updater,
        rankKind: prev.rankKind,
        context: prev.context,
      }))
    }
  })
  useCompletionWatcher(engagement, engagementMonitor, setEngagement)

  const submitBaseline = useCallback(async () => {
    if (!userPubkey || !graperankPubkey) return
    setBaseline({ ...IDLE_STEP, status: 'publishing' })
    try {
      const signer = await getNip07Signer()
      if (!signer) throw new Error('Nostr signer not available')
      const ndk = getNDK()
      ndk.signer = signer
      const event = buildBaselineWotEvent(ndk, graperankPubkey, { userPubkey })
      const { eventId, savedRequestId } = await publishAndSave(
        event,
        signer,
        baselineConfigForDb({ userPubkey }),
      )
      setBaseline({
        eventId,
        savedRequestId,
        naddr: null,
        status: 'running',
        error: null,
      })
    } catch (err) {
      console.error('[demo] baseline submit failed:', err)
      setBaseline({
        ...IDLE_STEP,
        status: 'error',
        error: err instanceof Error ? err.message : 'Submit failed',
      })
    }
  }, [graperankPubkey, userPubkey])

  const submitSemantic = useCallback(
    async (context: string, rankKind: RankKind) => {
      if (!semanticPubkey || !baseline.naddr) return
      setSemantic(prev => ({
        ...IDLE_STEP,
        status: 'publishing',
        rankKind: prev.rankKind,
        context,
      }))
      try {
        const signer = await getNip07Signer()
        if (!signer) throw new Error('Nostr signer not available')
        const ndk = getNDK()
        ndk.signer = signer
        const inputs = { baselineWotNaddr: baseline.naddr, context, rankKind }
        const event = buildSemanticSearchEvent(ndk, semanticPubkey, inputs)
        const { eventId, savedRequestId } = await publishAndSave(
          event,
          signer,
          semanticConfigForDb(inputs),
        )
        setSemantic({
          eventId,
          savedRequestId,
          naddr: null,
          status: 'running',
          error: null,
          rankKind,
          context,
        })
      } catch (err) {
        console.error('[demo] semantic submit failed:', err)
        setSemantic({
          ...IDLE_STEP,
          status: 'error',
          error: err instanceof Error ? err.message : 'Submit failed',
          rankKind,
          context,
        })
      }
    },
    [baseline.naddr, semanticPubkey],
  )

  const submitEngagement = useCallback(
    async (weights: { zap: number }) => {
      if (!graperankPubkey || !semantic.naddr) return
      setEngagement({ ...IDLE_STEP, status: 'publishing' })
      try {
        const signer = await getNip07Signer()
        if (!signer) throw new Error('Nostr signer not available')
        const ndk = getNDK()
        ndk.signer = signer
        const inputs = {
          semanticNaddr: semantic.naddr,
          rankKind: semantic.rankKind,
          zapWeight: weights.zap,
        }
        const event = buildEngagementRankEvent(ndk, graperankPubkey, inputs)
        const { eventId, savedRequestId } = await publishAndSave(
          event,
          signer,
          engagementConfigForDb(inputs),
        )
        setEngagement({
          eventId,
          savedRequestId,
          naddr: null,
          status: 'running',
          error: null,
        })
      } catch (err) {
        console.error('[demo] engagement submit failed:', err)
        setEngagement({
          ...IDLE_STEP,
          status: 'error',
          error: err instanceof Error ? err.message : 'Submit failed',
        })
      }
    },
    [graperankPubkey, semantic.naddr, semantic.rankKind],
  )

  const cancelStep = useCallback(
    (
      step: StepState,
      setStep: (s: StepState | ((prev: StepState) => StepState)) => void,
    ) => {
      if (step.status !== 'publishing' && step.status !== 'running') return
      setStep(prev => ({
        ...prev,
        status: 'error',
        error: 'Cancelled by user (service may still be processing)',
      }))
    },
    [],
  )

  const cancelBaseline = useCallback(() => cancelStep(baseline, setBaseline), [baseline, cancelStep])
  const cancelSemantic = useCallback(() => {
    cancelStep(semantic, (u) => {
      if (typeof u === 'function') {
        setSemantic(prev => ({
          ...u(prev),
          rankKind: prev.rankKind,
          context: prev.context,
        }))
      } else {
        setSemantic(prev => ({
          ...u,
          rankKind: prev.rankKind,
          context: prev.context,
        }))
      }
    })
  }, [semantic, cancelStep])
  const cancelEngagement = useCallback(() => cancelStep(engagement, setEngagement), [engagement, cancelStep])

  return {
    userPubkey,
    baseline,
    semantic,
    engagement,
    baselineMonitor,
    semanticMonitor,
    engagementMonitor,
    submitBaseline,
    submitSemantic,
    submitEngagement,
    cancelBaseline,
    cancelSemantic,
    cancelEngagement,
  }
}

type StepSetter = (updater: StepState | ((prev: StepState) => StepState)) => void

function useCompletionWatcher(
  step: StepState,
  monitor: ReturnType<typeof useRequestMonitor>,
  setStep: StepSetter,
) {
  const outputCount = monitor.outputEvents.length
  const feedbackCount = monitor.feedbackEvents.length
  // Use shared terminal-success detection so wording differences like
  // "Calculation completed..." still unblock completion transitions.
  const hasTerminalSuccess = monitor.feedbackEvents.some((feedback) =>
    isTerminalSuccessFeedback(feedback.status, feedback.message)
  )

  // Transition to completed only when terminal success feedback arrives
  useEffect(() => {
    if (step.status !== 'running') return
    if (!hasTerminalSuccess) return
    if (outputCount === 0) return

    const firstOutput = monitor.outputEvents[0]
    const naddr = buildOutputEventNaddr({
      kind: firstOutput.kind,
      pubkey: firstOutput.pubkey,
      tags: firstOutput.tags,
      relayHints: firstOutput.relayHints,
    })
    if (!naddr) {
      console.warn('[demo] could not build naddr from output event', firstOutput.id)
      return
    }

    if (step.savedRequestId) {
      void fetch(`/api/requests/${step.savedRequestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          resultEventIds: monitor.outputEvents.map(o => o.id),
          feedbackEventIds: monitor.feedbackEvents.map(f => f.id),
          completedAt: new Date().toISOString(),
          firstOutputNaddr: naddr,
        }),
      }).catch(err => console.error('[demo] sync PATCH failed:', err))
    }

    setStep(prev => ({
      ...prev,
      naddr,
      status: 'completed',
      error: null,
    }))
    // terminal success + output presence are the trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.status, outputCount, feedbackCount, hasTerminalSuccess])

  // Surface terminal error feedback
  useEffect(() => {
    if (step.status !== 'running') return
    const latest = monitor.feedbackEvents.at(-1)
    if (!latest) return
    if (latest.status === 'error') {
      setStep(prev => ({
        ...prev,
        status: 'error',
        error: latest.message || 'Service reported an error',
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.status, feedbackCount])
}
