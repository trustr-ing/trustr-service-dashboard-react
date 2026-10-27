import { NDKEvent } from '@nostr-dev-kit/ndk'
import { getNDK , connectNDK } from '@/lib/nostr/ndk'
import type { ExportableSubject, MuteMergeMode } from './types'
import { DEFAULT_MAX_ITEMS } from './types'

const PRIMARY_MUTE_LIST_KIND = 10000

export interface BuildMuteListArgs {
  userPubkey: string
  subjects: ExportableSubject[]
  mode: MuteMergeMode
  maxItems?: number
}

export interface BuildMuteListResult {
  event: NDKEvent
  existingFound: boolean
  newPubkeysAdded: number
  totalPubkeys: number
  truncated: boolean
}

/**
 * Build an unsigned kind-10000 Primary Mute List event.
 *
 * - `overwrite`: ignore prior list; produce a fresh event with only the new
 *   public `p` tags (capped at `maxItems`). Encrypted private mutes in
 *   `.content` and non-`p` mute tags from the prior list are discarded.
 * - `add-to`: fetch the user's latest kind-10000 (if any), keep its
 *   `.content` and all non-`p` tags intact, then union public `p` tags
 *   with the new subjects. Prefers existing entries on overflow (truncates
 *   new additions rather than removing prior mutes).
 */
export async function buildMuteListEvent({
  userPubkey,
  subjects,
  mode,
  maxItems = DEFAULT_MAX_ITEMS,
}: BuildMuteListArgs): Promise<BuildMuteListResult> {
  const ndk = getNDK()
  await connectNDK()

  const existing = mode === 'add-to'
    ? await ndk.fetchEvent({ kinds: [PRIMARY_MUTE_LIST_KIND], authors: [userPubkey] })
    : null

  const newPubkeys = subjects
    .filter(s => s.tagLetter === 'p')
    .map(s => s.value)

  const event = new NDKEvent(ndk)
  event.kind = PRIMARY_MUTE_LIST_KIND
  event.content = existing?.content ?? ''

  const nonPTags: string[][] = []
  const existingPubkeys: string[] = []

  if (existing) {
    for (const tag of existing.tags) {
      if (tag[0] === 'p' && tag[1]) {
        if (!existingPubkeys.includes(tag[1])) existingPubkeys.push(tag[1])
      } else if (tag[0] !== 'd') {
        // Preserve non-`p` mute tags (e.g. e/t/word) and any other tags
        // that aren't the (non-applicable) `d` tag.
        nonPTags.push(tag)
      }
    }
  }

  const finalPubkeys: string[] = []
  let newPubkeysAdded = 0

  if (mode === 'add-to') {
    // Preserve existing first; append new (deduped) until cap.
    for (const pk of existingPubkeys) {
      if (finalPubkeys.length >= maxItems) break
      finalPubkeys.push(pk)
    }
    for (const pk of newPubkeys) {
      if (finalPubkeys.length >= maxItems) break
      if (finalPubkeys.includes(pk)) continue
      finalPubkeys.push(pk)
      newPubkeysAdded++
    }
  } else {
    // Overwrite: ignore existing pubkeys and prior content/non-p tags.
    event.content = ''
    nonPTags.length = 0
    for (const pk of newPubkeys) {
      if (finalPubkeys.length >= maxItems) break
      if (finalPubkeys.includes(pk)) continue
      finalPubkeys.push(pk)
      newPubkeysAdded++
    }
  }

  const truncated =
    mode === 'add-to'
      ? existingPubkeys.length + newPubkeys.length > finalPubkeys.length
      : newPubkeys.length > finalPubkeys.length

  event.tags = [...nonPTags, ...finalPubkeys.map(pk => ['p', pk])]

  return {
    event,
    existingFound: !!existing,
    newPubkeysAdded,
    totalPubkeys: finalPubkeys.length,
    truncated,
  }
}
