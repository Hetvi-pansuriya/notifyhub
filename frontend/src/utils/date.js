/**
 * Date and time formatting helpers using browser's Intl in local timezone.
 */

export const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export function formatDateTime(isoString) {
  if (!isoString) return '-'
  try {
    const d = new Date(isoString)
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(d)
  } catch {
    return isoString
  }
}

export function formatDate(isoString) {
  if (!isoString) return '-'
  try {
    const d = new Date(isoString)
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d)
  } catch {
    return isoString
  }
}

export function formatTime(isoString) {
  if (!isoString) return '-'
  try {
    const d = new Date(isoString)
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(d)
  } catch {
    return isoString
  }
}

export function formatRelative(isoString) {
  if (!isoString) return '-'
  try {
    const d = new Date(isoString)
    const now = new Date()
    const diffSec = Math.floor((now - d) / 1000)
    if (diffSec < 10) return 'just now'
    if (diffSec < 60) return `${diffSec}s ago`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return `${diffHour}h ago`
    const diffDay = Math.floor(diffHour / 24)
    return `${diffDay}d ago`
  } catch {
    return isoString
  }
}
