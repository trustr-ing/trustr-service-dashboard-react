import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { DashboardShell } from '@/components/layouts/DashboardShell'

export default async function DemoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  return <DashboardShell userNpub={user.npub}>{children}</DashboardShell>
}
