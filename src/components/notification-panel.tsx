'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell, AlertTriangle, AlertCircle, Info, CheckCheck, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface Alert {
  id: string
  type: string
  severity: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
}

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case 'critical':
      return <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
    case 'warning':
      return <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
    default:
      return <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
  }
}

export function NotificationPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setAlerts(data.alerts)
        setUnreadCount(data.unreadCount)
      }
    } catch {
      // silent fail — notifications are non-critical
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + 30s auto-refresh
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30_000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Re-fetch when popover opens
  useEffect(() => {
    if (open) fetchNotifications()
  }, [open, fetchNotifications])

  const markAsRead = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isRead: true } : a))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch {
      // silent fail
    }
  }

  const markAllAsRead = async () => {
    const unreadIds = alerts.filter((a) => !a.isRead).map((a) => a.id)
    if (unreadIds.length === 0) return

    try {
      await Promise.all(
        unreadIds.map((id) =>
          fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          })
        )
      )
      setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })))
      setUnreadCount(0)
    } catch {
      // silent fail
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="glass-card w-80 p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <Badge
                variant="secondary"
                className="h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
              >
                {unreadCount}
              </Badge>
            )}
          </div>
        </div>

        <Separator className="opacity-50" />

        {/* Notification List */}
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <Bell className="h-8 w-8 opacity-30" />
              <p className="text-sm">No new notifications</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {alerts.map((alert) => (
                <button
                  key={alert.id}
                  onClick={() => markAsRead(alert.id)}
                  className={`group relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                    !alert.isRead ? 'bg-primary/[0.04]' : ''
                  }`}
                >
                  {/* Unread dot */}
                  {!alert.isRead && (
                    <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-primary" />
                  )}

                  {/* Severity icon */}
                  <div className="mt-0.5">
                    <SeverityIcon severity={alert.severity} />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1 pr-4">
                    <p
                      className={`text-sm leading-snug ${
                        !alert.isRead ? 'font-semibold' : 'font-medium'
                      }`}
                    >
                      {alert.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                      {alert.message}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      {formatDistanceToNow(new Date(alert.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer — Mark all as read */}
        {alerts.length > 0 && unreadCount > 0 && (
          <>
            <Separator className="opacity-50" />
            <div className="px-4 py-2.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full text-xs text-muted-foreground hover:text-foreground"
                onClick={markAllAsRead}
              >
                <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                Mark all as read
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}