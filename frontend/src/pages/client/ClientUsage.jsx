import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
import { userTimezone } from '../../utils/date'
import { StatCard } from '../../components/StatCard'
import { BarChart } from '../../components/BarChart'
import { RateLimitChart } from '../../components/RateLimitChart'
import { RangePicker, getRangePayload } from '../../components/RangePicker'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

/**
 * Reusable Usage view component.
 * Can be used in Client console (/app/usage) or embedded in Admin Client Detail (/admin/clients/:id).
 */
export function ClientUsage({ clientId = null, onNavigateToPlans }) {
  const [rangeKey, setRangeKey] = useState('7d')
  const [range, setRange] = useState(getRangePayload('7d'))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [summary, setSummary] = useState({
    sent: 0,
    success_rate: 1.0,
    rejected_429: 0,
  })
  const [seriesData, setSeriesData] = useState([])
  const [rateData, setRateData] = useState([])
  const [planInfo, setPlanInfo] = useState({
    name: 'Starter',
    monthly_email_limit: 10000,
    rate_limit_per_sec: 50,
    sent_this_month: 0,
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { from, to, bucket } = range
      const clientParam = clientId ? `&client_id=${encodeURIComponent(clientId)}` : ''
      const clientParamOnly = clientId ? `?client_id=${encodeURIComponent(clientId)}` : ''

      // Determine endpoints based on whether we are in admin mode (clientId provided) or client mode
      const summaryUrl = clientId
        ? `/admin/stats/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${clientParam}`
        : `/api/stats/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`

      const seriesUrl = clientId
        ? `/admin/stats/series?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&bucket=${encodeURIComponent(bucket)}&metric=sent&tz=${encodeURIComponent(userTimezone)}${clientParam}`
        : `/api/stats/series?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&bucket=${encodeURIComponent(bucket)}&metric=sent&tz=${encodeURIComponent(userTimezone)}`

      const rateUrl = clientId
        ? `/admin/stats/rate?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&bucket=${encodeURIComponent(bucket)}&tz=${encodeURIComponent(userTimezone)}${clientParam}`
        : `/api/stats/rate?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&bucket=${encodeURIComponent(bucket)}&tz=${encodeURIComponent(userTimezone)}`

      const planPromise = clientId
        ? request(`/admin/clients/${encodeURIComponent(clientId)}`)
        : request('/console/plan')

      const [sumRes, serRes, rateRes, plRes] = await Promise.all([
        request(summaryUrl),
        request(seriesUrl),
        request(rateUrl),
        planPromise,
      ])

      setSummary(sumRes || {})
      setSeriesData(Array.isArray(serRes) ? serRes : (serRes?.series || []))
      setRateData(rateRes || [])

      if (clientId) {
        // Admin client detail structure
        const c = plRes || {}
        setPlanInfo({
          name: c.plan?.name || 'Custom',
          monthly_email_limit: c.monthly_email_limit || c.plan?.monthly_email_limit || 10000,
          rate_limit_per_sec: c.rate_limit_per_sec || c.plan?.rate_limit_per_sec || 50,
          sent_this_month: c.sent_this_month || 0,
        })
      } else {
        // Client console plan endpoint structure
        const p = plRes || {}
        setPlanInfo({
          name: p.plan?.name || 'Starter',
          monthly_email_limit: p.plan?.monthly_email_limit || 10000,
          rate_limit_per_sec: p.rate_limit_per_sec || p.plan?.rate_limit_per_sec || 50,
          sent_this_month: p.sent_this_month || p.usage?.sent_this_month || 0,
        })
      }

      setLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to load usage statistics')
      setLoading(false)
    }
  }, [clientId, range])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleRangeChange = (newRange) => {
    setRangeKey(newRange.key)
    setRange(newRange)
  }

  const monthlyLimit = planInfo.monthly_email_limit || 10000
  const sentMonth = planInfo.sent_this_month || 0
  const pct = Math.min(100, Math.round((sentMonth / monthlyLimit) * 100))
  const remaining = Math.max(0, monthlyLimit - sentMonth)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header with Range Picker */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
            Usage & Analytics
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
            Telemetry metrics aligned to your local timezone ({userTimezone})
          </p>
        </div>
        <RangePicker selectedKey={rangeKey} onChange={handleRangeChange} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <Skeleton variant="card" height="110px" />
            <Skeleton variant="card" height="110px" />
            <Skeleton variant="card" height="110px" />
          </div>
          <Skeleton variant="card" height="110px" />
          <Skeleton variant="card" height="260px" />
          <Skeleton variant="card" height="260px" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <StatCard
              title="Total Emails Sent"
              value={summary.sent ?? 0}
              subtext={`Delivered in ${range.label}`}
              badgeType="green"
            />
            <StatCard
              title="Delivery Success Rate"
              value={summary.success_rate !== undefined ? `${(summary.success_rate * 100).toFixed(1)}%` : '100%'}
              subtext="Successfully received by provider"
              badgeType="blue"
            />
            <StatCard
              title="Rate Limit Hits (429)"
              value={summary.rejected_429 ?? 0}
              subtext="Requests rejected by throttle"
              badgeType={summary.rejected_429 > 0 ? 'red' : 'gray'}
            />
          </div>

          {/* Monthly Plan Usage Meter Card */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface-card, #12141a)',
              border: '1px solid var(--border-subtle, #1f232f)',
              borderRadius: 'var(--radius-lg, 16px)',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff' }}>
                  Monthly Plan Quota ({planInfo.name})
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-muted, #585f73)', marginTop: '2px' }}>
                  {sentMonth.toLocaleString()} of {monthlyLimit.toLocaleString()} monthly emails used ({pct}%)
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                  {remaining.toLocaleString()}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', marginLeft: '4px' }}>
                  remaining
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div
              style={{
                width: '100%',
                height: '8px',
                backgroundColor: '#1b1e2a',
                borderRadius: '9999px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  backgroundColor: pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : '#3b82f6',
                  borderRadius: '9999px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          {/* Emails Sent BarChart Card */}
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
                  Emails Sent
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', margin: '2px 0 0 0' }}>
                  Dispatched volume grouped by {range.bucket} ({range.label})
                </p>
              </div>
            </div>

            <BarChart
              data={seriesData}
              height={220}
              barColor="#3b82f6"
              unit="emails"
              emptyMessage="No emails were dispatched during this period."
            />
          </div>

          {/* Rate Limit & Throttle Chart Card */}
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
                  Rate Limiting & Throttle Activity
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', margin: '2px 0 0 0' }}>
                  Peak intake req/sec vs configured limit ({planInfo.rate_limit_per_sec || (rateData?.[0]?.rate_limit) || 50}/s). Red markers indicate 429 rejections.
                </p>
              </div>
            </div>

            <RateLimitChart
              data={rateData}
              rateLimit={planInfo.rate_limit_per_sec || (rateData?.[0]?.rate_limit) || 50}
              height={220}
            />
          </div>
        </>
      )}
    </div>
  )
}
