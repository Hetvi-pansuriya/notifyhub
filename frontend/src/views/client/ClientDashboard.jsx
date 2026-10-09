import React, { useState, useEffect, useCallback } from 'react'
import { request, ApiError } from '../../api'
import { usePolling } from '../../hooks/useApi'
import { userTimezone, formatDateTime, formatTime, formatRelative } from '../../utils/date'
import { StatCard } from '../../components/StatCard'
import { LineChart } from '../../components/LineChart'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

export function ClientDashboard({ onOpenDeliveryModal }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState({
    pending: 0,
    in_queue: 0,
    sent: 0,
    failed: 0,
    success_rate: 1.0,
  })
  const [seriesData, setSeriesData] = useState([])
  const [failedDeliveries, setFailedDeliveries] = useState([])
  const [retryingId, setRetryingId] = useState(null)
  const [actionFeedback, setActionFeedback] = useState(null)

  // Compute start of today in local browser time
  const getTodayRange = useCallback(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    return {
      from: startOfToday.toISOString(),
      to: now.toISOString(),
      tz: userTimezone,
    }
  }, [])

  const fetchData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      setError(null)
      try {
        const { from, to, tz } = getTodayRange()

        // 1. Stats summary for today
        const summaryPromise = request(`/api/stats/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)

        // 2. Hourly requests series for today
        const seriesPromise = request(
          `/api/stats/series?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&bucket=hour&metric=requests&tz=${encodeURIComponent(tz)}`
        )

        // 3. Failed/dead deliveries
        const failedPromise = request('/api/deliveries?status=dead&limit=10')

        const [sumRes, serRes, failRes] = await Promise.all([summaryPromise, seriesPromise, failedPromise])

        setSummary(sumRes || {})
        setSeriesData(serRes?.series || [])
        setFailedDeliveries(failRes?.items || [])
        setLoading(false)
      } catch (err) {
        if (!silent) {
          setError(err.message || 'Failed to load dashboard data')
          setLoading(false)
        }
      }
    },
    [getTodayRange]
  )

  useEffect(() => {
    fetchData(false)
  }, [fetchData])

  // Silent polling every 15s
  usePolling(fetchData, 15000)

  const handleRetry = async (deliveryId, e) => {
    e?.stopPropagation()
    setRetryingId(deliveryId)
    setActionFeedback(null)
    try {
      await request(`/api/deliveries/${deliveryId}/retry`, { method: 'POST' })
      setActionFeedback({ type: 'success', message: 'Delivery re-queued successfully!' })
      // Silently refresh list
      fetchData(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setActionFeedback({ type: 'warning', message: 'Delivery is already queued or currently processing.' })
      } else {
        setActionFeedback({ type: 'error', message: err.message || 'Failed to retry delivery' })
      }
    } finally {
      setRetryingId(null)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <Skeleton variant="card" height="110px" />
          <Skeleton variant="card" height="110px" />
          <Skeleton variant="card" height="110px" />
          <Skeleton variant="card" height="110px" />
        </div>
        <Skeleton variant="card" height="280px" />
        <Skeleton variant="card" height="240px" />
      </div>
    )
  }

  if (error) {
    return <ErrorState title="Dashboard Unavailable" message={error} onRetry={() => fetchData(false)} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
            Dashboard
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
            Real-time delivery telemetry for today ({userTimezone})
          </p>
        </div>
      </div>

      {actionFeedback && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            backgroundColor:
              actionFeedback.type === 'success'
                ? 'rgba(16, 185, 129, 0.15)'
                : actionFeedback.type === 'warning'
                ? 'rgba(245, 158, 11, 0.15)'
                : 'rgba(239, 68, 68, 0.15)',
            color:
              actionFeedback.type === 'success'
                ? '#34d399'
                : actionFeedback.type === 'warning'
                ? '#fbbf24'
                : '#f87171',
            border:
              actionFeedback.type === 'success'
                ? '1px solid rgba(16, 185, 129, 0.3)'
                : actionFeedback.type === 'warning'
                ? '1px solid rgba(245, 158, 11, 0.3)'
                : '1px solid rgba(239, 68, 68, 0.3)',
          }}
        >
          {actionFeedback.message}
        </div>
      )}

      {/* 4 Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <StatCard
          title="Pending"
          value={summary.pending ?? 0}
          subtext="Scheduled for future or waiting retry"
          badgeType="blue"
        />
        <StatCard
          title="In queue"
          value={summary.in_queue ?? 0}
          subtext="Due now and processing"
          badgeType="orange"
        />
        <StatCard
          title="Sent today"
          value={summary.sent ?? 0}
          subtext="Delivered successfully"
          badge={summary.success_rate !== undefined ? `${Math.round(summary.success_rate * 100)}% success` : undefined}
          badgeType="green"
        />
        <StatCard
          title="Failed"
          value={summary.failed ?? 0}
          subtext="Dead letters / maximum retries"
          badgeType={summary.failed > 0 ? 'red' : 'gray'}
        />
      </div>

      {/* Hourly Requests Today Chart Card */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface-card, #12141a)',
          border: '1px solid var(--border-subtle, #1f232f)',
          borderRadius: 'var(--radius-lg, 16px)',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
              Requests today
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', margin: '2px 0 0 0' }}>
              Hourly event intake volume across 24 hours ({userTimezone})
            </p>
          </div>
        </div>

        <LineChart
          data={seriesData}
          height={240}
          strokeColor="#3b82f6"
          unit="requests"
          emptyMessage="No request events recorded today yet."
        />
      </div>

      {/* Failed Deliveries Table Card */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface-card, #12141a)',
          border: '1px solid var(--border-subtle, #1f232f)',
          borderRadius: 'var(--radius-lg, 16px)',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
              Failed Deliveries
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', margin: '2px 0 0 0' }}>
              Deliveries that exhausted all retry attempts or failed fatally
            </p>
          </div>
          {failedDeliveries.length > 0 && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)' }}>
              Showing latest {failedDeliveries.length}
            </span>
          )}
        </div>

        {failedDeliveries.length === 0 ? (
          <EmptyState
            title="No failed deliveries"
            description="All notifications sent through your API are healthy and delivering without failures."
            style={{ minHeight: '180px' }}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)', color: 'var(--text-muted, #585f73)' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Recipient</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Event / Subject</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Retries</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Failure Reason</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Failed</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {failedDeliveries.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => onOpenDeliveryModal && onOpenDeliveryModal(item)}
                    style={{
                      borderBottom: '1px solid var(--border-subtle, #1f232f)',
                      cursor: onOpenDeliveryModal ? 'pointer' : 'default',
                      transition: 'background-color 0.12s',
                    }}
                  >
                    <td style={{ padding: '12px', color: '#ffffff', fontWeight: 500 }}>
                      {item.recipient_email || item.recipient || '—'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)' }}>
                      <div style={{ fontWeight: 500, color: '#f1f3f9' }}>{item.event_type || 'default'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted, #585f73)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.rendered_subject || item.subject || '—'}
                      </div>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)' }}>
                      {item.attempt_count ?? item.attempts ?? 0}
                    </td>
                    <td style={{ padding: '12px', color: '#f87171', maxWidth: '260px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                        {item.last_error || item.error || 'Max retries exhausted'}
                      </div>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted, #585f73)', whiteSpace: 'nowrap' }}>
                      {formatRelative(item.updated_at || item.created_at)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-action-small"
                        onClick={(e) => handleRetry(item.id, e)}
                        disabled={retryingId === item.id}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {retryingId === item.id ? 'Sending...' : 'Send again'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
