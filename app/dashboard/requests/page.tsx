'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'

type StatusFilter = 'all' | 'completed' | 'pending' | 'error'

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

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

  const filteredRequests = requests.filter(request => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'completed') return request.status === 'completed'
    if (statusFilter === 'pending') return request.status === 'pending' || request.status === 'processing'
    if (statusFilter === 'error') return request.status === 'error'
    return true
  })

  const statusCounts = {
    all: requests.length,
    completed: requests.filter(r => r.status === 'completed').length,
    pending: requests.filter(r => r.status === 'pending' || r.status === 'processing').length,
    error: requests.filter(r => r.status === 'error').length,
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

      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            statusFilter === 'all'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          All ({statusCounts.all})
        </button>
        <button
          onClick={() => setStatusFilter('completed')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            statusFilter === 'completed'
              ? 'border-green-500 text-green-600 dark:text-green-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          Completed ({statusCounts.completed})
        </button>
        <button
          onClick={() => setStatusFilter('pending')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            statusFilter === 'pending'
              ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          Pending ({statusCounts.pending})
        </button>
        <button
          onClick={() => setStatusFilter('error')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            statusFilter === 'error'
              ? 'border-red-500 text-red-600 dark:text-red-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          Failed ({statusCounts.error})
        </button>
      </div>

      {filteredRequests.length === 0 && requests.length > 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No {statusFilter !== 'all' ? statusFilter : ''} requests found.
            </p>
          </CardContent>
        </Card>
      ) : requests.length === 0 ? (
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
          {filteredRequests.map((request) => {
            const resultCount = request.resultEventIds ? JSON.parse(request.resultEventIds).length : 0
            const feedbackCount = request.feedbackEventIds ? JSON.parse(request.feedbackEventIds).length : 0
            
            return (
              <Link key={request.id} href={`/dashboard/requests/${request.id}`}>
                <Card className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors cursor-pointer">
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
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
