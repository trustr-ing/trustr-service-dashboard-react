'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useServiceAnnouncements } from '@/lib/hooks/useServiceAnnouncements'
import { ServiceAnnouncementCard } from '@/components/ServiceAnnouncementCard'

const SERVICE_ROUTES: Record<string, string> = {
  'trustr_graperank': '/dashboard/requests/new/graperank',
  'trustr_semantic_ranking': '/dashboard/requests/new/semantic',
}

export default function NewRequestPage() {
  const { announcements, loading, error, refresh } = useServiceAnnouncements()

  const getServiceRoute = (serviceId: string): string => {
    return SERVICE_ROUTES[serviceId] || `/dashboard/requests/new/${serviceId}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-600 dark:text-gray-400">Loading services...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">New Request</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Select a service to create a request
          </p>
        </div>
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <Button onClick={refresh}>Retry</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">New Request</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Select a service to create a request
          </p>
        </div>
        <Link href="/dashboard/requests">
          <Button variant="outline">Back to Requests</Button>
        </Link>
      </div>

      {announcements.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No services available. Services will appear here once they publish announcements.
            </p>
            <Button onClick={refresh}>Refresh</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {announcements.map((announcement) => (
            <ServiceAnnouncementCard
              key={announcement.id}
              announcement={announcement}
              href={getServiceRoute(announcement.serviceId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
