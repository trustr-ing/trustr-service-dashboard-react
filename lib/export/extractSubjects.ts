import type { ExportableSubject, SubjectTagLetter } from './types'
import { DEFAULT_MAX_ITEMS } from './types'

export interface FilterOptions {
  threshold: number
  maxItems?: number
  allowedTagLetters?: SubjectTagLetter[]
}

export interface FilterResult {
  selected: ExportableSubject[]
  totalConsidered: number
  totalMatchingThreshold: number
  capped: boolean
}

/**
 * Filter subjects by inclusive `>=` rank threshold, sort by rank descending,
 * cap to `maxItems`, and restrict to the allowed tag letters for the target.
 */
export function filterSubjectsForExport(
  subjects: ExportableSubject[],
  { threshold, maxItems = DEFAULT_MAX_ITEMS, allowedTagLetters }: FilterOptions,
): FilterResult {
  const allowedSet = allowedTagLetters ? new Set(allowedTagLetters) : null

  const considered = allowedSet
    ? subjects.filter(s => allowedSet.has(s.tagLetter))
    : subjects

  const matching = considered.filter(s => s.rank >= threshold)
  const sorted = [...matching].sort((a, b) => b.rank - a.rank)
  const capped = sorted.length > maxItems
  const selected = capped ? sorted.slice(0, maxItems) : sorted

  return {
    selected,
    totalConsidered: considered.length,
    totalMatchingThreshold: matching.length,
    capped,
  }
}
