import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { fetchProfiles, getDisplayName, type NostrProfile } from '@/lib/nostr/profiles'

interface RankedResult {
  subject: string
  resultTag: 'p' | 'e' | 'a'
  score: number
  confidence?: number
  rank: number
}

interface ResultsTableProps {
  results: RankedResult[]
  title?: string
  description?: string
  showProfiles?: boolean
}

export function ResultsTable({ results, title, description, showProfiles = true }: ResultsTableProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map())
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'rank-desc' | 'rank-asc' | 'subject-asc'>('rank-desc')
  const [rankFocus, setRankFocus] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const resultsPerPage = 20
  const canShowProfiles = showProfiles && results.every(result => result.resultTag === 'p')

  const rankBounds = useMemo(() => {
    if (results.length === 0) {
      return { min: 0, max: 0 }
    }

    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY

    for (const result of results) {
      if (result.score < min) min = result.score
      if (result.score > max) max = result.score
    }

    return { min, max }
  }, [results])

  const rankFocusWindow = useMemo(() => {
    const span = rankBounds.max - rankBounds.min
    if (span <= 0) {
      return 0
    }
    return Math.max(span * 0.06, 0.01)
  }, [rankBounds.max, rankBounds.min])

  useEffect(() => {
    if (!canShowProfiles || results.length === 0) return

    const loadProfiles = async () => {
      setLoadingProfiles(true)
      try {
        const pubkeys = results.map(result => result.subject)
        const fetchedProfiles = await fetchProfiles(pubkeys)
        setProfiles(fetchedProfiles)
      } catch (err) {
        console.error('Failed to fetch profiles:', err)
      } finally {
        setLoadingProfiles(false)
      }
    }

    loadProfiles()
  }, [canShowProfiles, results])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 2000)
  }

  const formatScore = (score: number): string => {
    return score.toFixed(6)
  }

  const exportToCSV = () => {
    const headers = ['Rank', 'Tag', 'Subject', 'Score', 'Confidence']
    const rows = results.map(r => [
      r.rank,
      r.resultTag,
      r.subject,
      r.score,
      r.confidence || ''
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `results-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportToJSON = () => {
    const jsonContent = JSON.stringify(results, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `results-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getScoreColor = (score: number): string => {
    if (score >= 0.9) return 'bg-green-500'
    if (score >= 0.7) return 'bg-blue-500'
    if (score >= 0.5) return 'bg-yellow-500'
    return 'bg-gray-500'
  }

  const getScoreWidth = (score: number): string => {
    return `${Math.max(score * 100, 5)}%`
  }

  const getExternalResultUrl = (result: RankedResult): string | null => {
    if (!result.subject) {
      return null
    }

    return `https://njump.me/${encodeURIComponent(result.subject)}`
  }

  const searchFilteredResults = results.filter(result => {
    if (!searchQuery) return true
    
    const query = searchQuery.toLowerCase()
    const profile = profiles.get(result.subject)
    const displayName = profile ? getDisplayName(profile).toLowerCase() : ''
    
    return (
      result.subject.toLowerCase().includes(query) ||
      displayName.includes(query) ||
      result.rank.toString().includes(query)
    )
  })

  const rankFilteredResults = searchFilteredResults.filter(result => {
    if (rankFocus === null) {
      return true
    }
    return Math.abs(result.score - rankFocus) <= rankFocusWindow
  })

  const sortedResults = [...rankFilteredResults].sort((a, b) => {
    if (sortBy === 'rank-asc') {
      return a.score - b.score
    }
    if (sortBy === 'subject-asc') {
      return a.subject.localeCompare(b.subject)
    }
    return b.score - a.score
  })

  // Calculate pagination
  const totalPages = Math.ceil(sortedResults.length / resultsPerPage)
  const startIndex = (currentPage - 1) * resultsPerPage
  const endIndex = startIndex + resultsPerPage
  const paginatedResults = sortedResults.slice(startIndex, endIndex)

  // Reset to page 1 when filters/sort change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, rankFocus, sortBy])

  if (results.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title || 'Results'}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center py-8">
            No results to display
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle>{title || `Results (${results.length})`}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {results.length > 0 && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                className="text-xs"
              >
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportToJSON}
                className="text-xs"
              >
                Export JSON
              </Button>
            </div>
          )}
        </div>
        {results.length > 0 && (
          <div className="mt-4">
            <input
              type="text"
              placeholder="Search by subject, name, or rank..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
            />

            <div className="mt-3 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300" htmlFor="results-sort">
                  Sort
                </label>
                <select
                  id="results-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'rank-desc' | 'rank-asc' | 'subject-asc')}
                  className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-800"
                >
                  <option value="rank-desc">Rank value: high → low</option>
                  <option value="rank-asc">Rank value: low → high</option>
                  <option value="subject-asc">Subject: A → Z</option>
                </select>
              </div>

              <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    Rank Focus
                  </span>
                  <div className="flex items-center gap-2">
                    {rankFocus !== null && (
                      <span className="text-xs text-gray-500">
                        {formatScore(rankFocus - rankFocusWindow)} to {formatScore(rankFocus + rankFocusWindow)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setRankFocus(null)}
                      className="text-xs text-blue-600 hover:underline disabled:text-gray-400"
                      disabled={rankFocus === null}
                    >
                      Show all
                    </button>
                  </div>
                </div>

                <input
                  type="range"
                  min={rankBounds.min}
                  max={rankBounds.max}
                  step={Math.max((rankBounds.max - rankBounds.min) / 200, 0.0001)}
                  value={rankFocus ?? rankBounds.max}
                  onChange={(e) => setRankFocus(parseFloat(e.target.value))}
                  disabled={rankBounds.max === rankBounds.min}
                  className="w-full"
                />

                <p className="text-xs text-gray-500">
                  {rankFocus === null
                    ? 'Showing all rank values. Move slider to focus around a score band.'
                    : `Focused around ${formatScore(rankFocus)} (±${formatScore(rankFocusWindow)}).`}
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-2">
              Showing {rankFilteredResults.length} of {results.length} results
            </p>
            {loadingProfiles && canShowProfiles && (
              <p className="text-xs text-gray-500 mt-1">Loading profile metadata...</p>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {paginatedResults.map((result, idx) => {
            const profile = profiles.get(result.subject)
            const displayName = profile ? getDisplayName(profile) : `${result.subject.slice(0, 12)}...`
            const avatarSource = profile?.picture || `https://api.dicebear.com/7.x/identicon/svg?seed=${result.subject}`
            const externalResultUrl = getExternalResultUrl(result)
            
            return (
              <div
                key={`${result.resultTag}:${result.subject}-${idx}`}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {canShowProfiles && (
                    <div className="flex-shrink-0">
                      <Image
                        src={avatarSource}
                        alt={displayName}
                        width={48}
                        height={48}
                        unoptimized
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        #{result.rank}
                      </span>
                      {canShowProfiles && (
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {displayName}
                        </span>
                      )}
                      <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                        {result.resultTag}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Rank Value: {formatScore(result.score)}
                      </span>
                      {result.confidence !== undefined && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Confidence: {formatScore(result.confidence)}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
                        {result.subject}
                      </code>
                      {externalResultUrl && (
                        <a
                          href={externalResultUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          njump.me
                        </a>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(result.subject)}
                        className="h-6 px-2 text-xs"
                      >
                        {copied === result.subject ? '✓' : 'Copy'}
                      </Button>
                    </div>
                    
                    <div className="mt-2">
                      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getScoreColor(result.score)} transition-all`}
                          style={{ width: getScoreWidth(result.score) }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function parseOutputEventResults(event: { tags: string[][] }): RankedResult[] {
  const tags = event.tags || []
  const resultTags = tags.filter((tag: string[]) => ['p', 'e', 'a'].includes(tag[0]) && tag[1])
  
  const results: RankedResult[] = []
  let currentRank = 1
  
  for (const tag of resultTags) {
    const subject = tag[1]
    
    // Skip reference tags (e.g. request pointer) and unranked tags.
    if (tag.length < 3) {
      continue
    }

    // TSM output format: [tag, subject, rank]
    // If present, extra value(s) may include confidence metadata.
    const rankValue = tag[2] ? parseFloat(tag[2]) : NaN
    if (!Number.isFinite(rankValue)) {
      continue
    }

    const confidenceValue = tag[3] ? parseFloat(tag[3]) : NaN
    const confidence = Number.isFinite(confidenceValue) ? confidenceValue : undefined

    results.push({
      subject,
      resultTag: tag[0] as 'p' | 'e' | 'a',
      score: rankValue,
      confidence,
      rank: currentRank++
    })
  }
  
  return results
}
