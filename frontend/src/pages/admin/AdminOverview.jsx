import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
import { usePolling } from '../../hooks/useApi'
import { userTimezone } from '../../utils/date'
import { StatCard } from '../../components/StatCard'
import { LineChart } from '../../components/LineChart'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

export function AdminOverview({ onSelectClient }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [overview, setOverview] = useState({
    active_clients: 0,
    total_clients: 0,
    emails_today: 0,
    success_rate_24h: 1.0,
    queue_depth: 0,
    needs_attention: [],
  })
  const [seriesData, setSeriesData] = useState([])
  const [topClients, setTopClients] = useState([])

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const now = new Date()
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      const fromIso = startOfToday.toISOString()
      const toIso = now.toISOString()

      // 1. Overview metrics & needs attention
      const overviewPromise = request('/admin/overview')

      // 2. Hourly emails series for platform today
      const seriesPromise = request(
        `/admin/stats/series?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&bucket=hour&metric=sent&tz=${encodeURIComponent(userTimezone)}`
      )

      // 3. Clients table for top clients list
      const clientsPromise = request('/admin/clients/table')

      const [ovRes, serRes, clRes] = await Promise.all([
        overviewPromise,
        seriesPromise,
        clientsPromise,
      ])

      setOverview(ovRes || {})
      setSeriesData(serRes?.series || [])

      // Sort clients by sent_today descending
      const sorted = [...(clRes || [])].sort((a, b) => (b.sent_today || 0) - (a.sent_today || 0))
      setTopClients(sorted.slice(0, 5))

      setLoading(false)
    } catch (err) {
      if (!silent) {
        setError(err.message || 'Failed to load platform overview')
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadData(false)
  }, [loadData])

  // Silent polling every 15s
  usePolling(loadData, 15000)

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <Skeleton variant="card" height="110px" />
          <Skeleton variant="card" height="110px" />
          <Skeleton variant="card" height="110px" />
          <Skeleton variant="card" height="110px" />
        </div>
        <Skeleton variant="card" height="260px" />
        <Skeleton variant="card" height="220px" />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => loadData(false)} />
  }

  const errRate = overview.success_rate_24h !== undefined
    ? Math.max(0, Math.round((1 - overview.success_rate_24h) * 100))
    : 0

  const needsAttentionList = overview.needs_attention || []
  const rateLimitedCount = needsAttentionList.filter((c) =>
    (c.reasons || []).some((r) => r.toLowerCase().includes('rate limit'))
  ).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
          Platform Overview
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
          Global delivery telemetry across all tenant clients ({userTimezone})
        </p>
      </div>

      {/* 4 Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <StatCard
          title="Active Clients"
          value={overview.active_clients ?? 0}
          subtext={`${overview.total_clients ?? 0} total registered tenants`}
          badgeType="blue"
        />
        <StatCard
          title="Emails Sent Today"
          value={overview.emails_today ?? 0}
          subtext="Non-skipped platform dispatches"
          badgeType="green"
        />
        <StatCard
          title="Platform Error Rate"
          value={`${errRate}%`}
          subtext="24-hour failed vs delivered ratio"
          badgeType={errRate > 5 ? 'red' : 'green'}
        />
        <StatCard
          title="Clients Needing Attention"
          value={needsAttentionList.length}
          subtext={`${rateLimitedCount} throttled / limits reaching`}
          badgeType={needsAttentionList.length > 0 ? 'orange' : 'gray'}
        />
      </div>

      {/* Hourly Platform Chart */}
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
              Emails Sent Today
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', margin: '2px 0 0 0' }}>
              Hourly volume across all clients today ({userTimezone})
            </p>
          </div>
        </div>

        <LineChart
          data={seriesData}
          height={240}
          strokeColor="#3b82f6"
          unit="emails"
          emptyMessage="No emails dispatched across the platform today yet."
        />
      </div>

      {/* Needs Attention Card */}
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
              Needs Attention
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', margin: '2px 0 0 0' }}>
              Clients currently throttled, paused, or reaching quota ceilings
            </p>
          </div>
        </div>

        {needsAttentionList.length === 0 ? (
          <EmptyState
            title="All systems optimal"
            description="No tenants are currently throttled or experiencing elevated errors."
            style={{ minHeight: '140px', padding: '24px' }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {needsAttentionList.map((c) => (
              <div
                key={c.id}
                onClick={() => onSelectClient && onSelectClient(c)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  backgroundColor: '#161922',
                  borderRadius: '10px',
                  border: '1px solid #202431',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease',
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                    {c.name}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                    {(c.reasons || []).map((reason, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: reason.includes('paused')
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                          color: reason.includes('paused') ? '#fbbf24' : '#f87171',
                        }}
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)' }}>
                    {c.emails_this_month?.toLocaleString()} / {c.monthly_limit?.toLocaleString()}
                  </span>
                  <button
                    type="button"
                    className="btn-action-small"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectClient && onSelectClient(c)
                    }}
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Clients Today Table */}
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
            Top Clients Today
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', margin: '2px 0 0 0' }}>
            Tenants generating the highest delivery volume today
          </p>
        </div>

        {topClients.length === 0 ? (
          <EmptyState
            title="No client activity today"
            description="Tenant email dispatches will appear here as they occur."
            style={{ minHeight: '140px', padding: '24px' }}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)', color: 'var(--text-muted, #585f73)' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Client Name</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Plan</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Sent Today</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Failed Now</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Status</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {topClients.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => onSelectClient && onSelectClient(c)}
                    style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '12px', fontWeight: 600, color: '#ffffff' }}>
                      {c.name}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)' }}>
                      {c.plan_name || 'Starter'}
                    </td>
                    <td style={{ padding: '12px', color: '#ffffff', fontWeight: 500 }}>
                      {(c.sent_today || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {c.failed_now > 0 ? (
                        <span style={{ color: '#f87171', fontWeight: 600 }}>{c.failed_now}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted, #585f73)' }}>0</span>
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span className={`badge ${c.status === 'active' ? 'badge-green' : 'badge-orange'}`}>
                        {c.status === 'active' ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-action-small"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectClient && onSelectClient(c)
                        }}
                      >
                        Inspect
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
