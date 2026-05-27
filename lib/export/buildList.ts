import { NDKEvent } from '@nostr-dev-kit/ndk'
import { getNDK } from '@/lib/nostr/ndk'
import type { ExportableSubject, ListExportTarget, ListKindSpec } from './types'
import { LIST_KIND_SPECS } from './types'

export interface BuildListArgs {
  target: ListExportTarget
  subjects: ExportableSubject[]
  title?: string
  dTag?: string
}

export interface BuildListResult {
  event: NDKEvent
  spec: ListKindSpec
}

/**
 * Build an unsigned NIP-51 list event from filtered subjects.
 *
 * - For addressable kinds, includes a `d` tag (using `spec.fixedDTag` when set,
 *   else the caller-provided `dTag`, else the spec default).
 * - For kind 10000 (Primary Mute List), omits `d` and `title` since it is a
 *   replaceable non-addressable list.
 * - Copies subject tags as `[tag_letter, value]` (rank and metadata stripped).
 */
export function buildListEvent({ target, subjects, title, dTag }: BuildListArgs): BuildListResult {
  const spec = LIST_KIND_SPECS[target]
  if (!spec) throw new Error(`Unknown list export target: ${target}`)

  const allowed = new Set(spec.allowedTagLetters)
  const filteredSubjects = subjects.filter(s => allowed.has(s.tagLetter))

  const ndk = getNDK()
  const event = new NDKEvent(ndk)
  event.kind = spec.kind
  event.content = ''

  const tags: string[][] = []

  if (spec.addressable) {
    const effectiveDTag = spec.fixedDTag ?? dTag ?? spec.defaultDTag
    if (!effectiveDTag) {
      throw new Error(`No d tag provided for addressable list kind ${spec.kind}`)
    }
    tags.push(['d', effectiveDTag])
  }

  if (spec.supportsTitle && title && title.trim().length > 0) {
    tags.push(['title', title.trim()])
  }

  for (const subject of filteredSubjects) {
    tags.push([subject.tagLetter, subject.value])
  }

  event.tags = tags
  return { event, spec }
}
