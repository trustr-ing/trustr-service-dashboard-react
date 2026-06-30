'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from '@/components/ui/dialog'
import { getNip07Signer } from '@/lib/nostr/ndk'
import {
  PRESET_BASELINE,
  PRESET_ENGAGEMENT,
  PRESET_SEMANTIC,
  PresetId,
  RankKind,
} from '@/lib/demo/presets'
import {
  buildAssertionRequestEvent,
} from '@/lib/export/buildAssertionRequest'
import { buildListEvent } from '@/lib/export/buildList'
import { buildMuteListEvent } from '@/lib/export/buildMuteListMerge'
import { filterSubjectsForExport } from '@/lib/export/extractSubjects'
import {
  fetchOutputEventByNaddr,
  getRelayHintsFromNaddr,
} from '@/lib/export/fetchOutputEvent'
import { signAndPublishExport } from '@/lib/export/publishExport'
import {
  DEFAULT_MAX_ITEMS,
  DEFAULT_THRESHOLD,
  ExportTarget,
  LIST_KIND_SPECS,
  ListExportTarget,
  MuteMergeMode,
} from '@/lib/export/types'
import { validateOutputEvent } from '@/lib/export/validateOutput'
import {
  ORCHESTRATOR_ASSERTIONS_PUBKEY,
  ORCHESTRATOR_ASSERTIONS_SERVICE_ID,
} from '@/lib/config'
import { pickRequestPTag } from '@/lib/subscription/requestRouting'

/**
 * Minimal shape needed to validate and extract subjects from a demo's
 * kind-37573 output event. Provided as a fast path so the dialog can skip
 * the relay round-trip whenever the in-memory monitor already has the
 * event's tags.
 */
export interface PrefetchedOutput {
  kind: number
  tags: string[][]
  pubkey?: string
  id?: string
  relays?: string[]
}

interface ExportResultsDialogProps {
  preset: PresetId
  outputNaddr: string
  /**
   * Tags + kind of the kind-37573 output as already observed by the demo
   * monitor. When provided, the dialog uses these directly and skips
   * fetching the event from relays.
   */
  prefetchedOutput?: PrefetchedOutput
  /**
   * Kind of content the demo ranked (relevant for engagement preset's
   * Kind Mute Set option). Passed from the semantic step's rankKind.
   */
  rankKind?: RankKind
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getTargetsForPreset(preset: PresetId, rankKind?: RankKind): ExportTarget[] {
  switch (preset) {
    case PRESET_BASELINE:
      return ['tsm-assertions']
    case PRESET_SEMANTIC:
      return ['bookmark-set', 'curation-set']
    case PRESET_ENGAGEMENT: {
      // Match the Kind Mute Set option to the content kind the engagement
      // step actually re-ranks. When rankKind is unknown, fall back to
      // showing both so the user can still pick.
      const muteSet: ExportTarget[] =
        rankKind === '1'
          ? ['kind-mute-set-notes']
          : rankKind === '30023'
            ? ['kind-mute-set-articles']
            : ['kind-mute-set-notes', 'kind-mute-set-articles']
      return ['follow-set', 'primary-mute-list', ...muteSet, 'starter-pack']
    }
    default:
      return []
  }
}

const TARGET_LABELS: Record<ExportTarget, string> = {
  'tsm-assertions': 'Trusted Assertions (TSM Subject Assertions, kind 37575)',
  'follow-set': LIST_KIND_SPECS['follow-set'].label,
  'primary-mute-list': LIST_KIND_SPECS['primary-mute-list'].label,
  'kind-mute-set-notes': LIST_KIND_SPECS['kind-mute-set-notes'].label,
  'kind-mute-set-articles': LIST_KIND_SPECS['kind-mute-set-articles'].label,
  'starter-pack': LIST_KIND_SPECS['starter-pack'].label,
  'bookmark-set': LIST_KIND_SPECS['bookmark-set'].label,
  'curation-set': LIST_KIND_SPECS['curation-set'].label,
}

type Status =
  | { kind: 'idle' }
  | { kind: 'publishing' }
  | { kind: 'success'; eventId: string; publishedTo: string[]; failedTo: string[] }
  | { kind: 'error'; message: string }

function isListTarget(target: ExportTarget): target is ListExportTarget {
  return target !== 'tsm-assertions'
}

type DialogOutput = { kind: number; tags: string[][] } | null

export function ExportResultsDialog({
  preset,
  outputNaddr,
  prefetchedOutput,
  rankKind,
  open,
  onOpenChange,
}: ExportResultsDialogProps) {
  const availableTargets = useMemo(
    () => getTargetsForPreset(preset, rankKind),
    [preset, rankKind],
  )
  const [target, setTarget] = useState<ExportTarget>(availableTargets[0])
  const [outputEvent, setOutputEvent] = useState<DialogOutput>(null)
  const [loadingOutput, setLoadingOutput] = useState(false)
  const [outputError, setOutputError] = useState<string | null>(null)

  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [title, setTitle] = useState('')
  const [dTag, setDTag] = useState('')
  const [muteMergeMode, setMuteMergeMode] = useState<MuteMergeMode>('add-to')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  // Reset state on open/close. When the parent already supplies the output
  // tags (prefetchedOutput), use them immediately and skip any network
  // round-trip; otherwise fall back to fetching by naddr.
  useEffect(() => {
    if (!open) {
      setOutputEvent(null)
      setOutputError(null)
      setStatus({ kind: 'idle' })
      return
    }
    setTarget(availableTargets[0])
    setThreshold(DEFAULT_THRESHOLD)
    setStatus({ kind: 'idle' })
    setOutputError(null)

    if (prefetchedOutput && prefetchedOutput.tags.length > 0) {
      setOutputEvent({ kind: prefetchedOutput.kind, tags: prefetchedOutput.tags })
      setLoadingOutput(false)
      return
    }

    setLoadingOutput(true)
    void (async () => {
      try {
        const evt = await fetchOutputEventByNaddr(outputNaddr)
        if (evt) {
          setOutputEvent({ kind: evt.kind ?? 0, tags: evt.tags })
        } else {
          setOutputError('Output event not found on relays')
        }
      } catch (err) {
        setOutputError(err instanceof Error ? err.message : 'Failed to load output')
      } finally {
        setLoadingOutput(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, outputNaddr, prefetchedOutput])

  // Reset title/dTag to per-target defaults when target changes
  useEffect(() => {
    if (target === 'tsm-assertions') {
      setTitle('Trustr Subject Assertions')
      setDTag(`trustr_assertions_${preset}`)
      return
    }
    const spec = LIST_KIND_SPECS[target]
    setTitle(spec.defaultTitle ?? '')
    setDTag(spec.fixedDTag ?? spec.defaultDTag ?? '')
  }, [target, preset])

  const validation = useMemo(
    () => (outputEvent ? validateOutputEvent(outputEvent) : null),
    [outputEvent],
  )

  const filterResult = useMemo(() => {
    if (!validation || !validation.ok) return null

    if (target === 'tsm-assertions') {
      // Assertions request just references the output event by naddr; no
      // subject filtering is performed at this layer.
      return null
    }

    const spec = LIST_KIND_SPECS[target]
    return filterSubjectsForExport(validation.subjects, {
      threshold,
      maxItems: DEFAULT_MAX_ITEMS,
      allowedTagLetters: spec.allowedTagLetters,
    })
  }, [validation, target, threshold])

  const canSubmit = (() => {
    if (status.kind === 'publishing') return false
    if (!validation) return false
    if (target === 'tsm-assertions') {
      if (!ORCHESTRATOR_ASSERTIONS_PUBKEY) return false
      return validation.ok
    }
    if (!filterResult) return false
    return filterResult.selected.length > 0
  })()

  const handleSubmit = async () => {
    if (!validation || !validation.ok) return
    setStatus({ kind: 'publishing' })
    try {
      let unsignedEvent

      if (target === 'tsm-assertions') {
        const configType =
          validation.subjects[0]?.tagLetter ?? 'p'
        const relayHints = getRelayHintsFromNaddr(outputNaddr)

        // Resolve the user's identity pubkey via NIP-07 so we can pick
        // a subscription pubkey if one exists. When the assertions
        // service runs in public_service mode (today through R2),
        // pickRequestPTag falls through to ORCHESTRATOR_ASSERTIONS_PUBKEY
        // and behavior is unchanged. After R3's flip to
        // subscription_service, the user MUST have an active
        // subscription or the orchestrator will reject the request.
        const assertionsSigner = await getNip07Signer()
        if (!assertionsSigner) throw new Error('Nostr signer not available')
        const assertionsUser = await assertionsSigner.user()
        if (!assertionsUser.pubkey) {
          throw new Error('Could not resolve user pubkey')
        }

        const routing = pickRequestPTag({
          userPubkey: assertionsUser.pubkey,
          servicePubkey: ORCHESTRATOR_ASSERTIONS_PUBKEY,
          serviceId: ORCHESTRATOR_ASSERTIONS_SERVICE_ID,
        })

        unsignedEvent = buildAssertionRequestEvent({
          povNaddr: outputNaddr,
          configType,
          dTag: dTag.trim() || `trustr_assertions_${preset}`,
          title: title.trim() || undefined,
          relayHints,
          signingPubkey: routing.viaSubscription ? routing.pTagPubkey : undefined,
        })
      } else if (target === 'primary-mute-list') {
        if (!filterResult) throw new Error('No subjects to export')
        const signer = await getNip07Signer()
        if (!signer) throw new Error('Nostr signer not available')
        const user = await signer.user()
        if (!user.pubkey) throw new Error('Could not resolve user pubkey')
        const { event } = await buildMuteListEvent({
          userPubkey: user.pubkey,
          subjects: filterResult.selected,
          mode: muteMergeMode,
        })
        unsignedEvent = event
      } else if (isListTarget(target)) {
        if (!filterResult) throw new Error('No subjects to export')
        const { event } = buildListEvent({
          target,
          subjects: filterResult.selected,
          title: title.trim() || undefined,
          dTag: dTag.trim() || undefined,
        })
        unsignedEvent = event
      } else {
        throw new Error(`Unsupported export target: ${target}`)
      }

      const result = await signAndPublishExport(unsignedEvent)
      setStatus({
        kind: 'success',
        eventId: result.signedEventId,
        publishedTo: result.publishedTo,
        failedTo: result.failedTo,
      })
    } catch (err) {
      console.error('[export] publish failed:', err)
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Export failed',
      })
    }
  }

  const spec = target !== 'tsm-assertions' ? LIST_KIND_SPECS[target] : null
  const isPrimaryMute = target === 'primary-mute-list'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPanel>
        <DialogHeader>
          <DialogTitle>Export Results</DialogTitle>
          <DialogDescription>
            Sign and publish an event built from this demo&apos;s results.
          </DialogDescription>
        </DialogHeader>

        {loadingOutput && (
          <p className="text-sm text-gray-500">Loading output event…</p>
        )}

        {outputError && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 mb-4">
            <p className="text-sm text-red-800 dark:text-red-200">{outputError}</p>
          </div>
        )}

        {validation && !validation.ok && (
          <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-3 mb-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              {validation.reason}
            </p>
          </div>
        )}

        {validation && validation.ok && (
          <div className="space-y-4">
            <div>
              <label className="field-label">Export to</label>
              <div className="space-y-1">
                {availableTargets.map(t => (
                  <label key={t} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="export-target"
                      value={t}
                      checked={target === t}
                      onChange={() => setTarget(t)}
                    />
                    {TARGET_LABELS[t]}
                  </label>
                ))}
              </div>
            </div>

            {target !== 'tsm-assertions' && (
              <div>
                <label className="field-label">
                  Rank threshold: {threshold.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={threshold}
                  onChange={e => setThreshold(parseFloat(e.target.value))}
                  className="w-full"
                />
                {filterResult && (
                  <p className="field-hint">
                    {filterResult.selected.length} of {filterResult.totalConsidered} subjects
                    will be included
                    {filterResult.capped
                      ? ` (capped at ${DEFAULT_MAX_ITEMS}; ${filterResult.totalMatchingThreshold} matched threshold)`
                      : ''}
                    .
                  </p>
                )}
              </div>
            )}

            {target === 'tsm-assertions' && !ORCHESTRATOR_ASSERTIONS_PUBKEY && (
              <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-3">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Assertions service pubkey is not configured. Set{' '}
                  <code>NEXT_PUBLIC_ASSERTIONS_PUBKEY</code> in the dashboard env.
                </p>
              </div>
            )}

            {isPrimaryMute && (
              <div>
                <label className="field-label">Merge mode</label>
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="mute-merge-mode"
                      value="add-to"
                      checked={muteMergeMode === 'add-to'}
                      onChange={() => setMuteMergeMode('add-to')}
                    />
                    Add to existing mute list (preserves prior entries)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="mute-merge-mode"
                      value="overwrite"
                      checked={muteMergeMode === 'overwrite'}
                      onChange={() => setMuteMergeMode('overwrite')}
                    />
                    Overwrite existing mute list
                  </label>
                </div>
              </div>
            )}

            {spec?.supportsTitle && (
              <div>
                <label className="field-label">Title</label>
                <input
                  type="text"
                  className="field-input"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={spec.defaultTitle ?? ''}
                />
              </div>
            )}

            {target === 'tsm-assertions' && (
              <div>
                <label className="field-label">Title (optional)</label>
                <input
                  type="text"
                  className="field-input"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>
            )}

            {spec?.addressable && !spec.fixedDTag && (
              <div>
                <label className="field-label">Identifier (d tag)</label>
                <input
                  type="text"
                  className="field-input"
                  value={dTag}
                  onChange={e => setDTag(e.target.value)}
                />
                <p className="field-hint">
                  Re-exporting with the same identifier overwrites the prior list.
                </p>
              </div>
            )}

            {spec?.fixedDTag && (
              <div className="text-xs text-gray-500">
                Identifier (d tag) is fixed to <code>{spec.fixedDTag}</code> per NIP-51.
              </div>
            )}

            {target === 'tsm-assertions' && (
              <div>
                <label className="field-label">Identifier (d tag)</label>
                <input
                  type="text"
                  className="field-input"
                  value={dTag}
                  onChange={e => setDTag(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {status.kind === 'success' && (
          <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-3 mt-4">
            <p className="text-sm text-green-800 dark:text-green-200">
              Published event <code>{status.eventId.slice(0, 16)}…</code> to{' '}
              {status.publishedTo.length} relay(s).
            </p>
            {status.failedTo.length > 0 && (
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                Did not reach: {status.failedTo.join(', ')}
              </p>
            )}
          </div>
        )}

        {status.kind === 'error' && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 mt-4">
            <p className="text-sm text-red-800 dark:text-red-200">{status.message}</p>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {status.kind === 'success' ? 'Close' : 'Cancel'}
          </Button>
          {status.kind !== 'success' && (
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
            >
              {status.kind === 'publishing' ? 'Publishing…' : 'Sign & Publish'}
            </Button>
          )}
        </DialogFooter>
      </DialogPanel>
    </Dialog>
  )
}
