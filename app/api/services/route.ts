import { NextResponse } from 'next/server'

const DEFAULT_ORCHESTRATOR_URL = 'http://167.99.181.211:3002'

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function getOrchestratorBaseUrls(): string[] {
  const candidates = [
    process.env.ORCHESTRATOR_API_URL,
    process.env.ORCHESTRATOR_URL,
    DEFAULT_ORCHESTRATOR_URL,
  ].filter((value): value is string => Boolean(value && value.trim()))

  return Array.from(new Set(candidates.map(value => normalizeBaseUrl(value))))
}

export async function GET() {
  const orchestratorBaseUrls = getOrchestratorBaseUrls()

  try {
    let lastError: Error | null = null

    for (const orchestratorBaseUrl of orchestratorBaseUrls) {
      try {
        const response = await fetch(`${orchestratorBaseUrl}/api/services`, {
          cache: 'no-store',
        })

        if (!response.ok) {
          lastError = new Error(`Orchestrator returned ${response.status} from ${orchestratorBaseUrl}`)
          continue
        }

        const data = await response.json()
        return NextResponse.json(data)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Failed to fetch orchestrator services')
      }
    }

    throw lastError ?? new Error('No orchestrator URL candidates available')
  } catch (error) {
    console.error('Failed to fetch services from orchestrator:', {
      error,
      orchestratorBaseUrls,
    })
    return NextResponse.json(
      { error: 'Failed to fetch services', services: [] },
      { status: 500 }
    )
  }
}
