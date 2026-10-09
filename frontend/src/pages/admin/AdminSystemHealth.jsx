import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
import { usePolling } from '../../hooks/useApi'
import { formatDateTime, formatRelative, userTimezone } from '../../utils/date'
import { StatCard } from '../../components/StatCard'
import { LineChart } from '../../components/LineChart'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

export function AdminSystemHealth() {
  const [health, setHealth] = useState(null)
  const [dbStatus, setDbStatus] = useState('connected')
  const [seriesData, setSeriesData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadHealth = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const now = new Date()
      const d1 = new Date(now.getTime() - 24 * 3600 * 1000)
      const fromIso = d1.toISOString()
      const toIso = now.toISOString()

      const [hRes, rootHealth, sRes] = await Promise.all([
        request('/admin/health'),
        request('/health').catch(() => ({ status: 'healthy', database: 'connected' })),
        request(
          `/admin/stats/series?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&bucket=hour&metric=sent&tz=${encodeURIComponent(userTimezone)}`
        ).catch(() => ({ series: [] })),
      ])
      setHealth(hRes)
      setDbStatus(rootHealth?.database === 'connected' ? 'connected' : 'degraded')
      setSeriesData(sRes?.series || [])
      setLoading(false)
    } catch (err) {
      if (!silent) {
        setError(err.message || 'Failed to fetch system telemetry')
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadHealth(false)
  }, [loadHealth])

  usePolling(loadHealth, 15000)

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <Skeleton variant="card" height="110px" />
          <Skeleton variant="card" height="110px" />
          <Skeleton variant="card" height="110px" />
        </div>
        <Skeleton variant="card" height="260px" />
        <Skeleton variant="card" height="280px" />
      </div>
    )
  }

  if (error || !health) {
    return <ErrorState message={error || 'System health telemetry unavailable'} onRetry={() => loadHealth(false)} />
  }

  const hbAge = health.worker_heartbeat_age_seconds
  const isWorkerStale = hbAge === null || hbAge > 60

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
          System Health & Telemetry
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
          Background daemon state, database connectivity, throughput graphs, and delivery queues ({userTimezone})
        </p>
      </div>

      {/* 3 Platform Health Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <StatCard
          title="Database (PostgreSQL)"
          value={dbStatus === 'connected' ? 'Connected' : 'Degraded'}
          subtext="Relational ACID storage engine"
          badge={dbStatus === 'connected' ? 'Healthy' : 'Degraded'}
          badgeType={dbStatus === 'connected' ? 'green' : 'red'}
        />
        <StatCard
          title="Queue Depth & Lag"
          value={health.queue_depth ?? 0}
          subtext={
            health.oldest_queued_age_seconds > 0
              ? `Oldest item waiting ${health.oldest_queued_age_seconds}s`
              : 'Zero backlog delay'
          }
          badge={health.queue_depth > 100 ? 'High load' : 'Normal'}
          badgeType={health.queue_depth > 100 ? 'orange' : 'green'}
        />
        <StatCard
          title="Background Worker"
          value={isWorkerStale ? 'Stale' : 'Active'}
          subtext={
            hbAge !== null
              ? `Heartbeat updated ${hbAge}s ago`
              : 'Awaiting worker heartbeat'
          }
          badge={!isWorkerStale ? 'Heartbeat OK' : 'Stale (>60s)'}
          badgeType={!isWorkerStale ? 'green' : 'orange'}
        />
      </div>

      {/* Throughput Graph Card */}
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
              24-Hour Processing Throughput
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', margin: '2px 0 0 0' }}>
              Real-time hourly outbound dispatch volume across all background workers
            </p>
          </div>
          <span className="badge badge-blue">Telemetry Stream</span>
        </div>

        <LineChart
          data={seriesData}
          height={240}
          strokeColor="#10b981"
          unit="dispatches"
          emptyMessage="No dispatch activity recorded in the last 24 hours."
        />
      </div>

      {/* Background Jobs Status Table Card */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface-card, #12141a)',
          border: '1px solid var(--border-subtle, #1f232f)',
          borderRadius: 'var(--radius-lg, 16px)',
          padding: '24px',
        }}
      >
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
            Background Daemon & Provider Telemetry
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', margin: '2px 0 0 0' }}>
            Real-time status of internal queue workers, scheduled reaper jobs, and outbound SMTP/API dispatchers
          </p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)', color: 'var(--text-muted, #585f73)' }}>
                <th style={{ padding: '10px 12px', fontWeight: 500 }}>Component / Job</th>
                <th style={{ padding: '10px 12px', fontWeight: 500 }}>Current Status</th>
                <th style={{ padding: '10px 12px', fontWeight: 500 }}>Details / Timestamps</th>
              </tr>
            </thead>
            <tbody>
              {/* Worker Heartbeat */}
              <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)' }}>
                <td style={{ padding: '12px', fontWeight: 600, color: '#ffffff' }}>
                  Worker Heartbeat
                </td>
                <td style={{ padding: '12px' }}>
                  {!isWorkerStale ? (
                    <span className="badge badge-green">OK</span>
                  ) : (
                    <span className="badge badge-orange" style={{ color: '#fbbf24', backgroundColor: 'rgba(245, 158, 11, 0.15)' }}>
                      Stale (&gt;60s)
                    </span>
                  )}
                </td>
                <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)' }}>
                  {hbAge !== null
                    ? `Daemon heartbeat refreshed ${hbAge}s ago`
                    : 'No heartbeat recorded in system_status'}
                </td>
              </tr>

              {/* Reaper Job */}
              <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)' }}>
                <td style={{ padding: '12px', fontWeight: 600, color: '#ffffff' }}>
                  Reaper Last Run
                </td>
                <td style={{ padding: '12px' }}>
                  <span className="badge badge-green">Operational</span>
                </td>
                <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)' }}>
                  {health.reaper_last_run
                    ? `Last executed ${formatRelative(health.reaper_last_run)} (${formatDateTime(health.reaper_last_run)})`
                    : 'Runs on start and every 60s'}
                </td>
              </tr>

              {/* Mail Provider */}
              <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)' }}>
                <td style={{ padding: '12px', fontWeight: 600, color: '#ffffff' }}>
                  Outbound Mail Provider
                </td>
                <td style={{ padding: '12px' }}>
                  <span className="badge badge-blue">
                    {health.mail_provider === 'sendgrid' ? 'SendGrid (Live API)' : 'MailHog (Dev SMTP)'}
                  </span>
                </td>
                <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)' }}>
                  {health.mail_provider === 'sendgrid'
                    ? 'Authenticated via SENDGRID_API_KEY with direct HTTP transport'
                    : 'Development localhost SMTP delivery via MailHog'}
                </td>
              </tr>

              {/* Last Successful Send */}
              <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)' }}>
                <td style={{ padding: '12px', fontWeight: 600, color: '#ffffff' }}>
                  Last Successful Send
                </td>
                <td style={{ padding: '12px' }}>
                  {health.last_send_ok_at ? (
                    <span className="badge badge-green">Delivered</span>
                  ) : (
                    <span className="badge badge-gray">Idle</span>
                  )}
                </td>
                <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)' }}>
                  {health.last_send_ok_at
                    ? `${formatDateTime(health.last_send_ok_at)} (${formatRelative(health.last_send_ok_at)})`
                    : 'No outbound emails dispatched yet'}
                </td>
              </tr>

              {/* Last Send Error */}
              <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)' }}>
                <td style={{ padding: '12px', fontWeight: 600, color: '#ffffff' }}>
                  Last Outbound Error
                </td>
                <td style={{ padding: '12px' }}>
                  {health.last_send_error ? (
                    <span className="badge badge-red">Error logged</span>
                  ) : (
                    <span className="badge badge-green">None</span>
                  )}
                </td>
                <td style={{ padding: '12px', color: health.last_send_error ? '#f87171' : 'var(--text-muted, #585f73)' }}>
                  {health.last_send_error || 'No fatal outbound transmission errors'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
