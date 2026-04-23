'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LatestFeedback } from '@/components/demo/LatestFeedback'
import { useServiceAnnouncements } from '@/lib/hooks/useServiceAnnouncements'
import { useDemoPipeline } from '@/lib/hooks/useDemoPipeline'
import { RankKind } from '@/lib/demo/presets'

function CompletedBadge() {
  return (
    <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200">
      Completed
    </span>
  )
}

function StepHeader({ step, title, description, completed }: { step: number; title: string; description: string; completed: boolean }) {
  return (
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle>
            <span className="text-gray-400 mr-2">{step}.</span>
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {completed && <CompletedBadge />}
      </div>
    </CardHeader>
  )
}

export function DiscoveryDemoPage() {
  const { announcements, loading: announcementsLoading, error: announcementsError } = useServiceAnnouncements()

  const graperankPubkey = useMemo(
    () => announcements.find(a => a.serviceId === 'trustr_graperank')?.pubkey ?? null,
    [announcements],
  )
  const semanticPubkey = useMemo(
    () => announcements.find(a => a.serviceId === 'trustr_semantic_ranking')?.pubkey ?? null,
    [announcements],
  )

  const pipeline = useDemoPipeline(graperankPubkey, semanticPubkey)

  const [contextOverride, setContextOverride] = useState<string | null>(null)
  const [rankKindOverride, setRankKindOverride] = useState<RankKind | null>(null)
  const [zapWeight, setZapWeight] = useState(0.5)
  const [reactionWeight, setReactionWeight] = useState(0.5)
  const [replyWeight, setReplyWeight] = useState(0.5)

  const context = contextOverride ?? pipeline.semantic.context
  const rankKind = rankKindOverride ?? pipeline.semantic.rankKind

  const baselineReady = pipeline.baseline.status === 'completed' && !!pipeline.baseline.naddr
  const semanticReady = pipeline.semantic.status === 'completed' && !!pipeline.semantic.naddr

  const baselineActive = pipeline.baseline.status === 'publishing' || pipeline.baseline.status === 'running'
  const semanticActive = pipeline.semantic.status === 'publishing' || pipeline.semantic.status === 'running'
  const engagementActive = pipeline.engagement.status === 'publishing' || pipeline.engagement.status === 'running'

  const canSubmitBaseline = !!pipeline.userPubkey && !!graperankPubkey && !baselineActive
  const canSubmitSemantic = baselineReady && !!semanticPubkey && context.trim().length > 0 && !semanticActive
  const canSubmitEngagement = semanticReady && !!graperankPubkey && !engagementActive

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight mt-2">Trustr MVP Demo</h2>
        <p className="text-gray-600 dark:text-gray-400">
          A three-step pipeline: build your web of trust, search it by topic, rank authors by engagement.
        </p>
      </div>

      {announcementsLoading && (
        <p className="text-sm text-gray-500">Loading available services…</p>
      )}
      {announcementsError && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-sm text-red-800 dark:text-red-200">{announcementsError}</p>
        </div>
      )}

      <Card>
        <StepHeader
          step={1}
          title="Baseline Web of Trust"
          description="GrapeRank ranking of your follow graph (4 levels deep), filtered by mutes and reports."
          completed={baselineReady}
        />
        <CardContent className="space-y-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <div>
              <span className="font-medium">POV:</span>{' '}
              <span className="font-mono text-xs">
                {pipeline.userPubkey
                  ? `${pipeline.userPubkey.slice(0, 16)}… (your pubkey)`
                  : 'Detecting…'}
              </span>
            </div>
            <div>
              <span className="font-medium">Interpreters:</span> follows (iterate 6), mutes, reports
            </div>
          </div>

          <div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => void pipeline.submitBaseline()}
                disabled={!canSubmitBaseline}
              >
                {baselineReady
                  ? 'Re-run baseline WoT'
                  : baselineActive
                    ? 'Running…'
                    : 'Configure my baseline WoT'}
              </Button>
              {baselineActive && (
                <Button type="button" variant="outline" onClick={pipeline.cancelBaseline}>
                  Cancel
                </Button>
              )}
            </div>
            <LatestFeedback
              active={baselineActive}
              feedbackEvents={pipeline.baselineMonitor.feedbackEvents}
              isConnected={pipeline.baselineMonitor.isConnected}
            />
            {pipeline.baseline.status === 'error' && pipeline.baseline.error && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{pipeline.baseline.error}</p>
            )}
            {baselineReady && pipeline.baseline.eventId && (
              <p className="text-xs text-gray-500 mt-1">
                <Link
                  href={`/dashboard/requests/${pipeline.baseline.eventId}`}
                  className="underline hover:text-gray-700 dark:hover:text-gray-300"
                >
                  View results
                </Link>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className={!baselineReady ? 'opacity-60' : ''}>
        <StepHeader
          step={2}
          title="Search WoT Events by Topic"
          description="Semantic embedding search over events authored by people in your WoT."
          completed={semanticReady}
        />
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Search for</label>
            <input
              type="text"
              value={context}
              onChange={e => setContextOverride(e.target.value)}
              placeholder="e.g., nostr relay operators"
              disabled={!baselineReady || semanticActive}
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">
              Natural-language query. Matched by embedding similarity, not keyword search.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Looking for</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="rankKind"
                  value="1"
                  checked={rankKind === '1'}
                  onChange={() => setRankKindOverride('1')}
                  disabled={!baselineReady || semanticActive}
                />
                Notes (kind 1)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="rankKind"
                  value="30023"
                  checked={rankKind === '30023'}
                  onChange={() => setRankKindOverride('30023')}
                  disabled={!baselineReady || semanticActive}
                />
                Articles (kind 30023)
              </label>
            </div>
          </div>

          <div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => void pipeline.submitSemantic(context.trim(), rankKind)}
                disabled={!canSubmitSemantic}
              >
                {semanticActive ? 'Searching…' : 'Search'}
              </Button>
              {semanticActive && (
                <Button type="button" variant="outline" onClick={pipeline.cancelSemantic}>
                  Cancel
                </Button>
              )}
            </div>
            <LatestFeedback
              active={semanticActive}
              feedbackEvents={pipeline.semanticMonitor.feedbackEvents}
              isConnected={pipeline.semanticMonitor.isConnected}
            />
            {pipeline.semantic.status === 'error' && pipeline.semantic.error && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{pipeline.semantic.error}</p>
            )}
            {semanticReady && pipeline.semantic.eventId && (
              <p className="text-xs text-gray-500 mt-1">
                <Link
                  href={`/dashboard/requests/${pipeline.semantic.eventId}`}
                  className="underline hover:text-gray-700 dark:hover:text-gray-300"
                >
                  View {pipeline.semanticMonitor.outputEvents.length > 0
                    ? `${pipeline.semanticMonitor.outputEvents.length} output event(s)`
                    : 'results'}
                </Link>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className={!semanticReady ? 'opacity-60' : ''}>
        <StepHeader
          step={3}
          title="Rerank Event Authors by Engagement"
          description="Rank the authors from the topical search by number of zaps and zap amount on the ranked events."
          completed={pipeline.engagement.status === 'completed'}
        />
        <CardContent className="space-y-4">
          <WeightSlider
            label="Zaps"
            value={zapWeight}
            onChange={setZapWeight}
            disabled={!semanticReady || engagementActive}
          />
          <div className="opacity-50 space-y-4 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
            <WeightSlider label="Reactions" value={reactionWeight} onChange={setReactionWeight} disabled />
            <WeightSlider label="Replies" value={replyWeight} onChange={setReplyWeight} disabled />
            <p className="text-xs text-gray-500">
              Reactions & replies require graperank-side interpreter support (not available in this deployment yet).
            </p>
          </div>

          <div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => void pipeline.submitEngagement({ zap: zapWeight })}
                disabled={!canSubmitEngagement}
              >
                {engagementActive ? 'Ranking…' : 'Rank authors'}
              </Button>
              {engagementActive && (
                <Button type="button" variant="outline" onClick={pipeline.cancelEngagement}>
                  Cancel
                </Button>
              )}
            </div>
            <LatestFeedback
              active={engagementActive}
              feedbackEvents={pipeline.engagementMonitor.feedbackEvents}
              isConnected={pipeline.engagementMonitor.isConnected}
            />
            {pipeline.engagement.status === 'error' && pipeline.engagement.error && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{pipeline.engagement.error}</p>
            )}
            {pipeline.engagement.status === 'completed' && pipeline.engagement.eventId && (
              <p className="text-xs text-gray-500 mt-1">
                <Link
                  href={`/dashboard/requests/${pipeline.engagement.eventId}`}
                  className="underline hover:text-gray-700 dark:hover:text-gray-300"
                >
                  View ranked authors
                </Link>
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function WeightSlider({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        {label}: {value.toFixed(1)}
      </label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.1"
        value={value}
        disabled={disabled}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full disabled:cursor-not-allowed"
      />
    </div>
  )
}
