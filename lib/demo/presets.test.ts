import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import NDK, { NDKEvent } from '@nostr-dev-kit/ndk'
import {
  buildEngagementRankEvent,
  engagementConfigForDb,
  validateDemoRequestShape,
} from './presets'

function getInterpreterConfig(event: NDKEvent): Array<Record<string, unknown>> {
  const interpretersTag = event.tags.find((tag) => tag[0] === 'config' && tag[1] === 'interpreters')
  assert.ok(interpretersTag?.[2], 'config:interpreters tag is required')

  const parsed = JSON.parse(interpretersTag[2])
  assert.ok(Array.isArray(parsed), 'config:interpreters must be a JSON array')
  return parsed as Array<Record<string, unknown>>
}

describe('demo presets', () => {
  it('emits both baseline and zap interpreters with fat zap slider mapped to >10000000 msats', () => {
    const event = buildEngagementRankEvent(
      new NDK(),
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      {
        semanticNaddr: 'naddr1semanticpayload',
        rankKind: '1',
        zapWeight: 0.6,
        fatZapWeight: 0.9,
      },
    )

    const interpreters = getInterpreterConfig(event)
    const baselineInterpreter = interpreters.find((entry) => entry.id === 'nostr-0')
    const zapInterpreter = interpreters.find((entry) => entry.id === 'nostr-9735')

    assert.ok(baselineInterpreter, 'engagement request must include nostr-0 baseline interpreter')
    assert.ok(zapInterpreter, 'engagement request must include nostr-9735 zap interpreter')

    const baselineParams = baselineInterpreter?.params as Record<string, unknown>
    assert.equal(baselineParams?.actorType, 'e')
    assert.equal(baselineParams?.subjectType, 'pubkey')
    assert.equal(baselineParams?.value, 1)
    assert.equal(baselineParams?.confidence, 0.2)

    const zapParams = zapInterpreter?.params as Record<string, unknown>
    assert.equal(zapParams?.actorType, 'e')
    assert.equal(zapParams?.subjectType, 'pubkey')
    assert.equal(zapParams?.value, 0.6)
    assert.equal(zapParams?.confidence, 1.0)
    assert.equal(zapParams?.['>10000000'], 0.9)
  })

  it('persists both zap and fat-zap weights in saved demo config', () => {
    const savedConfig = engagementConfigForDb({
      semanticNaddr: 'naddr1semanticpayload',
      rankKind: '30023',
      zapWeight: 0.4,
      fatZapWeight: 0.8,
    })

    assert.deepEqual(savedConfig.weights, {
      zaps: 0.4,
      fatZaps: 0.8,
    })
  })

  it('accepts only supported zap directional pairs in demo guardrails', () => {
    const supportedEvent = new NDKEvent(new NDK())
    supportedEvent.tags = [
      ['config', 'type', 'pubkey'],
      ['config', 'interpreters', JSON.stringify([
        {
          id: 'nostr-9735',
          params: { actorType: 'e', subjectType: 'pubkey' },
        },
      ])],
    ]

    assert.equal(validateDemoRequestShape(supportedEvent), null)

    const invalidEvent = new NDKEvent(new NDK())
    invalidEvent.tags = [
      ['config', 'type', 'pubkey'],
      ['config', 'interpreters', JSON.stringify([
        {
          id: 'nostr-9735',
          params: { actorType: 'e', subjectType: 'p' },
        },
      ])],
    ]

    assert.match(
      validateDemoRequestShape(invalidEvent) || '',
      /actorType\/subjectType must be one of e->pubkey, pubkey->e, p->pubkey, pubkey->p/,
    )
  })
})
