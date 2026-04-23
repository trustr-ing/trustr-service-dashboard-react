'use client'

import { useCallback, useEffect, useState } from 'react'
import { getNDK, getNip07Signer } from '@/lib/nostr/ndk'
import { buildOutputEventNaddr } from '@/lib/nostr/naddr'
import {
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

export interface DemoPipeline {
  userPubkey: string | null
  baseline: StepState
  semantic: StepState & { rankKind: RankKind }
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
  await event.sign(signer)
  await event.publish()

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

export function useDemoPipeline(
  graperankPubkey: string | null,
  semanticPubkey: string | null,
): DemoPipeline {
  const [userPubkey, setUserPubkey] = useState<string | null>(null)

  const [baseline, setBaseline] = useState<StepState>(IDLE_STEP)
  const [semantic, setSemantic] = useState<StepState & { rankKind: RankKind }>({
    ...IDLE_STEP,
    rankKind: '1',
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

  // Rehydrate from prior completed runs
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/requests')
        if (!res.ok) return
        const data = await res.json()
        const rows: ApiSavedRequest[] = data.requests || []

        const latest = (preset: string): ApiSavedRequest | undefined =>
          rows.find(r => {
            if (r.status !== 'completed' || !r.firstOutputNaddr) return false
            const cfg = parsePresetFromRow(r)
            return cfg?.preset === preset
          })

        const base = latest(PRESET_BASELINE)
        if (base) {
          setBaseline({
            eventId: base.eventId,
            savedRequestId: base.id,
            naddr: base.firstOutputNaddr,
            status: 'completed',
            error: null,
          })
        }

        const sem = latest(PRESET_SEMANTIC)
        if (sem) {
          const cfg = parsePresetFromRow(sem)
          const rk = (cfg?.rankKind === '30023' ? '30023' : '1') as RankKind
          setSemantic({
            eventId: sem.eventId,
            savedRequestId: sem.id,
            naddr: sem.firstOutputNaddr,
            status: 'completed',
            error: null,
            rankKind: rk,
          })
        }

        const eng = latest(PRESET_ENGAGEMENT)
        if (eng) {
          setEngagement({
            eventId: eng.eventId,
            savedRequestId: eng.id,
            naddr: eng.firstOutputNaddr,
            status: 'completed',
            error: null,
          })
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
      setSemantic(prev => ({ ...updater(prev), rankKind: prev.rankKind }))
    } else {
      setSemantic(prev => ({ ...updater, rankKind: prev.rankKind }))
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
      setSemantic(prev => ({ ...IDLE_STEP, status: 'publishing', rankKind: prev.rankKind }))
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
        })
      } catch (err) {
        console.error('[demo] semantic submit failed:', err)
        setSemantic(prev => ({
          ...IDLE_STEP,
          status: 'error',
          error: err instanceof Error ? err.message : 'Submit failed',
          rankKind: prev.rankKind,
        }))
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
      if (typeof u === 'function') setSemantic(prev => ({ ...u(prev), rankKind: prev.rankKind }))
      else setSemantic(prev => ({ ...u, rankKind: prev.rankKind }))
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

  // Transition to completed on first output
  useEffect(() => {
    if (step.status !== 'running') return
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
    // outputCount is the trigger; other deps are stable or read through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.status, outputCount])

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
