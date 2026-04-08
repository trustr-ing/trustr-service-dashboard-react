import { NextResponse } from 'next/server'

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://167.99.181.211:3002'

export async function GET() {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/services`, {
      cache: 'no-store'
    })
    
    if (!response.ok) {
      throw new Error(`Orchestrator returned ${response.status}`)
    }
    
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Failed to fetch services from orchestrator:', error)
    return NextResponse.json(
      { error: 'Failed to fetch services', services: [] },
      { status: 500 }
    )
  }
}
