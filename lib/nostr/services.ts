interface ActiveService {
  serviceId: string
  pubkey: string
  healthy?: boolean
}

interface ServicesResponse {
  services?: ActiveService[]
}

export async function fetchServicePubkey(serviceId: string): Promise<string | null> {
  try {
    const response = await fetch('/api/services', { cache: 'no-store' })
    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as ServicesResponse
    const service = data.services?.find(s => s.serviceId === serviceId)

    return service?.pubkey || null
  } catch {
    return null
  }
}
