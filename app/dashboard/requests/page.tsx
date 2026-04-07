'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'

interface SavedRequest {
  id: number
  eventId: string
  status: string
  publishedAt: string
  completedAt: string | null
  resultEventIds: string
  feedbackEventIds: string
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<SavedRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/requests')
      const data = await response.json()
      setRequests(data.requests || [])
    } catch (error) {
      console.error('Failed to fetch requests:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200',
      processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200',
      completed: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200',
      error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200',
    }
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status as keyof typeof colors] || colors.pending}`}>
        {status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-600 dark:text-gray-400">Loading requests...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">My Requests</h2>
          <p className="text-gray-600 dark:text-gray-400">
            View and monitor your service requests
          </p>
        </div>
        <Link href="/dashboard/requests/new">
          <Button>New Request</Button>
        </Link>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              You haven&apos;t created any requests yet.
            </p>
            <Link href="/dashboard/requests/new">
              <Button>Create Your First Request</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const resultCount = request.resultEventIds ? JSON.parse(request.resultEventIds).length : 0
            const feedbackCount = request.feedbackEventIds ? JSON.parse(request.feedbackEventIds).length : 0
            
            return (
              <Card key={request.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">
                        Request {request.eventId.slice(0, 8)}...
                      </CardTitle>
                      <CardDescription>
                        Published {format(new Date(request.publishedAt), 'PPp')}
                      </CardDescription>
                    </div>
                    {getStatusBadge(request.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
                    <div>
                      <span className="font-medium">{resultCount}</span> results
                    </div>
                    <div>
                      <span className="font-medium">{feedbackCount}</span> feedback events
                    </div>
                    {request.completedAt && (
                      <div>
                        Completed {format(new Date(request.completedAt), 'PPp')}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
