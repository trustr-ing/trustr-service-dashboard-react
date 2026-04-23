import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Manage your Trustr service requests
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>MVP Demo</CardTitle>
            <CardDescription>Run the 3-step demo flow with live progress updates</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/demo">
              <Button className="w-full">Launch Demo</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>New Request</CardTitle>
            <CardDescription>Create a new service request</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/requests/new">
              <Button className="w-full">Create Request</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My Requests</CardTitle>
            <CardDescription>View all your requests</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/requests">
              <Button variant="outline" className="w-full">
                View Requests
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
