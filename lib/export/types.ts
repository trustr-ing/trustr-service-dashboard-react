export type SubjectTagLetter = 'p' | 'e' | 'a'

export type ListExportTarget =
  | 'follow-set'
  | 'primary-mute-list'
  | 'kind-mute-set-notes'
  | 'kind-mute-set-articles'
  | 'starter-pack'
  | 'bookmark-set'
  | 'curation-set'

export type ExportTarget = ListExportTarget | 'tsm-assertions'

export type MuteMergeMode = 'overwrite' | 'add-to'

export interface ExportableSubject {
  tagLetter: SubjectTagLetter
  /** Original subject value (pubkey hex, event id, or `<kind>:<pubkey>:<d>` coordinate). */
  value: string
  /** Original positional rank from the 37573 output (>= 0). */
  rank: number
  /** Original tag (preserved verbatim for round-trip; rank/metadata stripped on export). */
  raw: string[]
}

export interface ExportOptions {
  target: ExportTarget
  title?: string
  dTag?: string
  /** Inclusive `>=` threshold against the result tag rank. */
  threshold: number
  /** Hard cap; defaults to 1000. */
  maxItems?: number
  /** Only required when target = 'primary-mute-list'. */
  muteMergeMode?: MuteMergeMode
}

export interface ListKindSpec {
  kind: number
  allowedTagLetters: SubjectTagLetter[]
  addressable: boolean
  supportsTitle: boolean
  /** Fixed `d` value per NIP-51 (e.g. kind 30007 must use the muted kind string). */
  fixedDTag?: string
  /** Suggested default title. */
  defaultTitle?: string
  /** Suggested default `d` for replaceable overwrite semantics. */
  defaultDTag?: string
  /** Human label for the dialog. */
  label: string
}

export const LIST_KIND_SPECS: Record<ListExportTarget, ListKindSpec> = {
  'follow-set': {
    kind: 30000,
    allowedTagLetters: ['p'],
    addressable: true,
    supportsTitle: true,
    defaultTitle: 'Trustr Follow Set',
    defaultDTag: 'trustr_follow_set',
    label: 'Follow Set (kind 30000)',
  },
  'primary-mute-list': {
    kind: 10000,
    allowedTagLetters: ['p'],
    addressable: false,
    supportsTitle: false,
    label: 'Primary Mute List (kind 10000)',
  },
  'kind-mute-set-notes': {
    kind: 30007,
    allowedTagLetters: ['p'],
    addressable: true,
    supportsTitle: true,
    fixedDTag: '1',
    defaultTitle: 'Trustr Notes Mute Set',
    label: 'Notes Mute Set (kind 30007, d="1")',
  },
  'kind-mute-set-articles': {
    kind: 30007,
    allowedTagLetters: ['p'],
    addressable: true,
    supportsTitle: true,
    fixedDTag: '30023',
    defaultTitle: 'Trustr Articles Mute Set',
    label: 'Articles Mute Set (kind 30007, d="30023")',
  },
  'starter-pack': {
    kind: 39089,
    allowedTagLetters: ['p'],
    addressable: true,
    supportsTitle: true,
    defaultTitle: 'Trustr Starter Pack',
    defaultDTag: 'trustr_starter_pack',
    label: 'Starter Pack (kind 39089)',
  },
  'bookmark-set': {
    kind: 30003,
    allowedTagLetters: ['e', 'a'],
    addressable: true,
    supportsTitle: true,
    defaultTitle: 'Trustr Bookmark Set',
    defaultDTag: 'trustr_bookmark_set',
    label: 'Bookmark Set (kind 30003)',
  },
  'curation-set': {
    kind: 30004,
    allowedTagLetters: ['e', 'a'],
    addressable: true,
    supportsTitle: true,
    defaultTitle: 'Trustr Curation Set',
    defaultDTag: 'trustr_curation_set',
    label: 'Curation Set (kind 30004)',
  },
}

export const DEFAULT_MAX_ITEMS = 1000
export const DEFAULT_THRESHOLD = 0.1
