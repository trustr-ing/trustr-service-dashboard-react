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
