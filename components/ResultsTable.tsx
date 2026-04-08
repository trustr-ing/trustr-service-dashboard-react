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

  const getScoreColor = (score: number): string => {
    if (score >= 0.9) return 'bg-green-500'
    if (score >= 0.7) return 'bg-blue-500'
    if (score >= 0.5) return 'bg-yellow-500'
    return 'bg-gray-500'
  }

  const getScoreWidth = (score: number): string => {
    return `${Math.max(score * 100, 5)}%`
  }

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
        <CardTitle>{title || `Results (${results.length})`}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {results.map((result, idx) => {
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
