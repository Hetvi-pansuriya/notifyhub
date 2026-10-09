import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
import { StatCard } from '../../components/StatCard'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

export function ClientPlan() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentPlanData, setCurrentPlanData] = useState(null)
  const [availablePlans, setAvailablePlans] = useState([])

  const loadPlan = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [currentRes, allRes] = await Promise.all([
        request('/console/plan'),
        request('/console/plans'),
      ])
      setCurrentPlanData(currentRes || {})
      setAvailablePlans(allRes || [])
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to load plan details')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPlan()
  }, [loadPlan])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Skeleton variant="card" height="130px" />
        <Skeleton variant="card" height="180px" />
        <Skeleton variant="card" height="240px" />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadPlan} />
  }

  const plan = currentPlanData?.plan || {}
  const usage = currentPlanData?.usage || {}

  const monthlyLimit = plan.monthly_email_limit || 10000
  const sentThisMonth = usage.sent_this_month || 0
  const monthlyPct = Math.min(100, Math.round((sentThisMonth / monthlyLimit) * 100))
  const monthlyRemaining = Math.max(0, monthlyLimit - sentThisMonth)

  const dailyLimit = plan.daily_email_limit || 1000
  const sentToday = usage.sent_today || 0
  const dailyPct = Math.min(100, Math.round((sentToday / dailyLimit) * 100))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
          Plan & Quotas
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
          Current subscription plan tier and delivery capacity limits
        </p>
      </div>

      {/* Current Plan Overview Card */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface-card, #12141a)',
          border: '1px solid var(--border-subtle, #1f232f)',
          borderRadius: 'var(--radius-lg, 16px)',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Active Subscription
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#ffffff', marginTop: '4px' }}>
              {plan.name || 'Starter Plan'}
            </div>
          </div>
          <span className="badge badge-green" style={{ fontSize: '12px', padding: '4px 12px' }}>
            Current Plan
          </span>
        </div>

        {/* Plan Limits Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <StatCard
            title="Monthly Email Limit"
            value={monthlyLimit}
            subtext="Calendar month quota"
            badgeType="blue"
          />
          <StatCard
            title="Daily Safety Limit"
            value={dailyLimit}
            subtext="Per-day safety ceiling"
            badgeType="orange"
          />
          <StatCard
            title="Rate Limit"
            value={`${plan.rate_limit_per_second ?? plan.rate_limit_per_sec ?? 50}/sec`}
            subtext="Token bucket throttle"
            badgeType="gray"
          />
        </div>

        {/* Monthly Quota Meter */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f9' }}>
              Monthly Usage Meter
            </span>
            <span style={{ fontSize: '12.5px', color: 'var(--text-muted, #585f73)' }}>
              {sentThisMonth.toLocaleString()} of {monthlyLimit.toLocaleString()} emails sent ({monthlyPct}%) · {monthlyRemaining.toLocaleString()} remaining
            </span>
          </div>
          <div style={{ width: '100%', height: '8px', backgroundColor: '#1b1e2a', borderRadius: '9999px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${monthlyPct}%`,
                height: '100%',
                backgroundColor: monthlyPct > 90 ? '#ef4444' : monthlyPct > 75 ? '#f59e0b' : '#10b981',
                borderRadius: '9999px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        {/* Daily Usage Meter */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f9' }}>
              Daily Safety Limit
            </span>
            <span style={{ fontSize: '12.5px', color: 'var(--text-muted, #585f73)' }}>
              {sentToday.toLocaleString()} of {dailyLimit.toLocaleString()} emails sent today ({dailyPct}%)
            </span>
          </div>
          <div style={{ width: '100%', height: '8px', backgroundColor: '#1b1e2a', borderRadius: '9999px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${dailyPct}%`,
                height: '100%',
                backgroundColor: dailyPct > 90 ? '#ef4444' : '#3b82f6',
                borderRadius: '9999px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* Available Plans Comparison Card */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface-card, #12141a)',
          border: '1px solid var(--border-subtle, #1f232f)',
          borderRadius: 'var(--radius-lg, 16px)',
          padding: '24px',
        }}
      >
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
            Available Platform Plans
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
            Review capacity tiers configured for this NotifyHub deployment.
          </p>
        </div>

        <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)', color: 'var(--text-muted, #585f73)' }}>
                <th style={{ padding: '10px 12px', fontWeight: 500 }}>Plan Name</th>
                <th style={{ padding: '10px 12px', fontWeight: 500 }}>Monthly Limit</th>
                <th style={{ padding: '10px 12px', fontWeight: 500 }}>Daily Limit</th>
                <th style={{ padding: '10px 12px', fontWeight: 500 }}>Rate Limit</th>
                <th style={{ padding: '10px 12px', fontWeight: 500, textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {availablePlans.map((p) => {
                const isCurrent = p.name === plan.name
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)' }}>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#ffffff' }}>
                      {p.name}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)' }}>
                      {(p.monthly_email_limit || 0).toLocaleString()} / month
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)' }}>
                      {(p.daily_email_limit || 0).toLocaleString()} / day
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)' }}>
                      {p.rate_limit_per_second || 50} req/sec
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {isCurrent ? (
                        <span className="badge badge-green">Active</span>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)' }}>Available</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Note */}
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#161922',
            border: '1px solid var(--border-subtle, #1f232f)',
            borderRadius: '8px',
            fontSize: '12.5px',
            color: 'var(--text-muted, #585f73)',
          }}
        >
          ℹ <strong style={{ color: '#ffffff' }}>Need to upgrade or change your limits?</strong> Contact your platform administrator to adjust your plan assignment.
        </div>
      </div>
    </div>
  )
}
