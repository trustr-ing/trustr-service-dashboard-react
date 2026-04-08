import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ServiceAnnouncement } from '@/lib/nostr/announcements'

interface ServiceAnnouncementCardProps {
  announcement: ServiceAnnouncement
  href: string
}

export function ServiceAnnouncementCard({ announcement, href }: ServiceAnnouncementCardProps) {
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <CardTitle>{announcement.title}</CardTitle>
        <CardDescription>
          {announcement.summary}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700 dark:text-gray-300">Service ID:</span>
            <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">
              {announcement.serviceId}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700 dark:text-gray-300">Pubkey:</span>
            <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">
              {announcement.pubkey.slice(0, 16)}...
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700 dark:text-gray-300">Output Kind:</span>
            <span className="text-gray-600 dark:text-gray-400">{announcement.outputKind}</span>
          </div>
          {announcement.configs.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-700 dark:text-gray-300">Config Parameters:</span>
              <span className="text-gray-600 dark:text-gray-400">{announcement.configs.length}</span>
            </div>
          )}
          {announcement.options.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-700 dark:text-gray-300">Options:</span>
              <span className="text-gray-600 dark:text-gray-400">{announcement.options.length}</span>
            </div>
          )}
        </div>
        <Link href={href}>
          <Button className="w-full">Configure Request</Button>
        </Link>
      </CardContent>
    </Card>
  )
}
