const ORCHESTRATOR_API = process.env.ORCHESTRATOR_API_URL || 'http://10.118.0.3:3002'

export interface OrchestratorSubscription {
  id: string
  userPubkey: string
  subscriptionPubkey: string
  status: 'active' | 'suspended' | 'revoked'
  allowedServices: string[] | null
  createdAt: number
  expiresAt: number | null
}

export async function createOrchestratorSubscription(
  userPubkey: string,
  allowedServices?: string[]
): Promise<OrchestratorSubscription> {
  const response = await fetch(`${ORCHESTRATOR_API}/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userPubkey,
      allowedServices: allowedServices || null,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to create subscription: ${response.statusText}`)
  }

  const data = await response.json()
  return data.subscription
}

export async function getOrchestratorSubscriptions(
  userPubkey: string
): Promise<OrchestratorSubscription[]> {
  const response = await fetch(
    `${ORCHESTRATOR_API}/subscriptions?userPubkey=${encodeURIComponent(userPubkey)}`
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch subscriptions: ${response.statusText}`)
  }

  const data = await response.json()
  return data.subscriptions
}

export async function getActiveSubscription(
  userPubkey: string
): Promise<OrchestratorSubscription | null> {
  const subscriptions = await getOrchestratorSubscriptions(userPubkey)
  return subscriptions.find(sub => sub.status === 'active') || null
}
