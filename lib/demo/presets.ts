import NDK, { NDKEvent } from '@nostr-dev-kit/ndk'

export const BASELINE_WOT_D_TAG = 'baseline_wot'

export const PRESET_BASELINE = 'demo_baseline_wot'
export const PRESET_SEMANTIC = 'demo_semantic'
export const PRESET_ENGAGEMENT = 'demo_engagement'

export type PresetId =
  | typeof PRESET_BASELINE
  | typeof PRESET_SEMANTIC
  | typeof PRESET_ENGAGEMENT

export type RankKind = '1' | '30023'

export interface BaselineInputs {
  userPubkey: string
}

export interface SemanticInputs {
  baselineWotNaddr: string
  context: string
  rankKind: RankKind
}

export interface EngagementInputs {
  semanticNaddr: string
  rankKind: RankKind
  zapWeight: number
}

export interface SavedConfigData {
  preset: PresetId
  [key: string]: unknown
}

type DemoInterpreterParams = {
  actorType?: string
  subjectType?: string
}

type DemoInterpreterRequest = {
  id?: string
  params?: DemoInterpreterParams
}

const PUBKEY_LIKE_OUTPUT_TYPES = new Set(['pubkey', 'p', 'P'])
const EVENT_REFERENCE_SUBJECT_TYPES = new Set(['e', 'a', 'id'])

function getConfigTagValue(event: NDKEvent, key: string): string | undefined {
  return event.tags.find((tag) => tag[0] === 'config' && tag[1] === key)?.[2]
}

function parseInterpreterConfig(event: NDKEvent): {
  interpreters?: DemoInterpreterRequest[]
  parseError?: string
} {
  const interpretersRaw = getConfigTagValue(event, 'interpreters')
  if (!interpretersRaw) return {}

  try {
    const parsed = JSON.parse(interpretersRaw)
    if (!Array.isArray(parsed)) {
      return { parseError: 'config:interpreters must be a JSON array' }
    }
    return { interpreters: parsed as DemoInterpreterRequest[] }
  } catch {
    return { parseError: 'config:interpreters must be valid JSON' }
  }
}

export function validateDemoRequestShape(event: NDKEvent): string | null {
  // Demo guardrail: pubkey-like outputs can only accept event-reference
  // subjects through the known zap sender -> resolved actor path.
  const outputType = getConfigTagValue(event, 'type')
  if (!outputType) return 'Missing required config:type on demo request event'
  if (!PUBKEY_LIKE_OUTPUT_TYPES.has(outputType)) return null

  const { interpreters, parseError } = parseInterpreterConfig(event)
  if (parseError) return parseError
  if (!interpreters || interpreters.length === 0) return null

  for (const interpreter of interpreters) {
    const subjectType = interpreter.params?.subjectType
    if (!subjectType || !EVENT_REFERENCE_SUBJECT_TYPES.has(subjectType)) continue

    const actorType = interpreter.params?.actorType
    if (actorType === 'P') continue

    const interpreterLabel = interpreter.id || 'unknown interpreter'
    return `Invalid demo request shape for ${interpreterLabel}: config:type=${outputType} with subjectType=${subjectType} requires actorType='P'`
  }

  return null
}

export function assertValidDemoRequestShape(event: NDKEvent): void {
  const validationError = validateDemoRequestShape(event)
  if (validationError) {
    throw new Error(validationError)
  }
}

export function buildBaselineWotEvent(
  ndk: NDK,
  graperankPubkey: string,
  inputs: BaselineInputs,
): NDKEvent {
  const event = new NDKEvent(ndk)
  event.kind = 37572
  event.content = ''
  event.tags = [
    ['d', BASELINE_WOT_D_TAG],
    ['p', graperankPubkey],
    ['k', '37573'],
    ['config', 'pov', inputs.userPubkey],
    ['config', 'type', 'pubkey'],
    ['config', 'minrank', '0.0001'],
    ['config', 'attenuation', '0.5'],
    ['config', 'rigor', '0.5'],
    ['config', 'precision', '0.00001'],
    ['config', 'interpreters', JSON.stringify([
      {
        id: 'nostr-3',
        iterate: 4,
        params: { actorType: 'pubkey', subjectType: 'p', value: 1.0, confidence: 1.0 },
      },
      {
        id: 'nostr-10000',
        params: { actorType: 'pubkey', subjectType: 'p', value: 1.0, confidence: 1.0 },
      },
      {
        id: 'nostr-1984',
        params: { actorType: 'pubkey', subjectType: 'p', value: 1.0, confidence: 1.0 },
      },
    ])],
  ]
  return event
}

export function buildSemanticSearchEvent(
  ndk: NDK,
  semanticPubkey: string,
  inputs: SemanticInputs,
): NDKEvent {
  const event = new NDKEvent(ndk)
  event.kind = 37572
  event.content = ''
  event.tags = [
    ['d', `demo_semantic_${Date.now()}`],
    ['p', semanticPubkey],
    ['k', '37573'],
    ['config', 'type', 'pubkey'],
    ['config', 'pov', inputs.baselineWotNaddr],
    ['option', 'rank_type', 'id'],
    ['option', 'rank_kind', inputs.rankKind],
    ['option', 'context', inputs.context],
    ['option', 'model', 'fused'],
  ]
  return event
}

export function buildEngagementRankEvent(
  ndk: NDK,
  graperankPubkey: string,
  inputs: EngagementInputs,
): NDKEvent {
  const event = new NDKEvent(ndk)
  event.kind = 37572
  event.content = ''
  event.tags = [
    ['d', `demo_engagement_${Date.now()}`],
    ['p', graperankPubkey],
    ['k', '37573'],
    ['config', 'pov', inputs.semanticNaddr],
    ['config', 'type', 'pubkey'],
    ['config', 'interpreters', JSON.stringify([
      {
        id: 'nostr-9735',
        iterate: 1,
        params: { actorType: 'P', subjectType: 'e', value: inputs.zapWeight, confidence: 1.0 },
      },
    ])],
  ]
  return event
}

export function baselineConfigForDb(inputs: BaselineInputs): SavedConfigData {
  return { preset: PRESET_BASELINE, pov: inputs.userPubkey, type: 'pubkey' }
}

export function semanticConfigForDb(inputs: SemanticInputs): SavedConfigData {
  return {
    preset: PRESET_SEMANTIC,
    baselineWotNaddr: inputs.baselineWotNaddr,
    context: inputs.context,
    rankKind: inputs.rankKind,
  }
}

export function engagementConfigForDb(inputs: EngagementInputs): SavedConfigData {
  return {
    preset: PRESET_ENGAGEMENT,
    semanticNaddr: inputs.semanticNaddr,
    rankKind: inputs.rankKind,
    weights: {
      zaps: inputs.zapWeight,
    },
  }
}
