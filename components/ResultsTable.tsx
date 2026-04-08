import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { fetchProfiles, getDisplayName, type NostrProfile } from '@/lib/nostr/profiles'

interface RankedResult {
  pubkey: string
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
  const [currentPage, setCurrentPage] = useState(1)
  const resultsPerPage = 20

  useEffect(() => {
    if (!showProfiles || results.length === 0) return

    const loadProfiles = async () => {
      setLoadingProfiles(true)
      try {
        const pubkeys = results.map(r => r.pubkey)
        const fetchedProfiles = await fetchProfiles(pubkeys)
        setProfiles(fetchedProfiles)
      } catch (err) {
        console.error('Failed to fetch profiles:', err)
      } finally {
        setLoadingProfiles(false)
      }
    }

    loadProfiles()
  }, [results, showProfiles])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 2000)
  }

  const formatScore = (score: number): string => {
    return score.toFixed(6)
  }

  const exportToCSV = () => {
    const headers = ['Rank', 'Pubkey', 'Score', 'Confidence']
    const rows = results.map(r => [
      r.rank,
      r.pubkey,
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

  // Filter results based on search query
  const filteredResults = results.filter(result => {
    if (!searchQuery) return true
    
    const query = searchQuery.toLowerCase()
    const profile = profiles.get(result.pubkey)
    const displayName = profile ? getDisplayName(profile).toLowerCase() : ''
    
    return (
      result.pubkey.toLowerCase().includes(query) ||
      displayName.includes(query) ||
      result.rank.toString().includes(query)
    )
  })

  // Calculate pagination
  const totalPages = Math.ceil(filteredResults.length / resultsPerPage)
  const startIndex = (currentPage - 1) * resultsPerPage
  const endIndex = startIndex + resultsPerPage
  const paginatedResults = filteredResults.slice(startIndex, endIndex)

  // Reset to page 1 when search query changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

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
              placeholder="Search by pubkey, name, or rank..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
            />
            {searchQuery && (
              <p className="text-xs text-gray-500 mt-1">
                Showing {filteredResults.length} of {results.length} results
              </p>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {paginatedResults.map((result, idx) => {
            const profile = profiles.get(result.pubkey)
            const displayName = profile ? getDisplayName(profile) : `${result.pubkey.slice(0, 8)}...`
            
            return (
              <div
                key={`${result.pubkey}-${idx}`}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {showProfiles && (
                    <div className="flex-shrink-0">
                      {profile?.picture ? (
                        <img
                          src={profile.picture}
                          alt={displayName}
                          className="w-12 h-12 rounded-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = `https://api.dicebear.com/7.x/identicon/svg?seed=${result.pubkey}`
                          }}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold">
                          {displayName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        #{result.rank}
                      </span>
                      {showProfiles && (
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {displayName}
                        </span>
                      )}
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Score: {formatScore(result.score)}
                      </span>
                      {result.confidence !== undefined && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Confidence: {formatScore(result.confidence)}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
                        {result.pubkey}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(result.pubkey)}
                        className="h-6 px-2 text-xs"
                      >
                        {copied === result.pubkey ? '✓' : 'Copy'}
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

export function parseOutputEventResults(event: { tags?: string[][] }): RankedResult[] {
  const tags = event.tags || []
  const pTags = tags.filter((t: string[]) => t[0] === 'p' && t[1])
  
  const results: RankedResult[] = []
  
  for (let i = 0; i < pTags.length; i++) {
    const tag = pTags[i]
    const pubkey = tag[1]
    const score = tag[2] ? parseFloat(tag[2]) : 0
    const confidence = tag[3] ? parseFloat(tag[3]) : undefined
    
    results.push({
      pubkey,
      score,
      confidence,
      rank: i + 1
    })
  }
  
  return results
}
