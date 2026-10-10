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
  const [switchingId, setSwitchingId] = useState(null)
  const [message, setMessage] = useState(null)

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

  const handleSelectPlan = async (p) => {
    if (switchingId || p.id === currentPlanData?.plan?.id) return
    setSwitchingId(p.id)
    setMessage(null)
    try {
      await request('/console/plan/select', {
        method: 'POST',
        body: { plan_id: p.id },
      })
      setMessage({ type: 'success', text: `Successfully switched to the ${p.name} plan!` })
      await loadPlan()
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to switch plan' })
    } finally {
      setSwitchingId(null)
    }
  }

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
  const monthlyLimit = plan.monthly_email_limit || 10000
  const sentThisMonth = currentPlanData?.sent_this_month || 0
  const monthlyPct = Math.min(100, Math.round((sentThisMonth / monthlyLimit) * 100))
  const monthlyRemaining = Math.max(0, monthlyLimit - sentThisMonth)

  const dailyLimit = currentPlanData?.daily_limit || plan.daily_email_limit || 30
  const sentToday = currentPlanData?.sent_today || 0
  const dailyPct = Math.min(100, Math.round((sentToday / dailyLimit) * 100))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
          Plan & Quotas
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
          Current subscription tier, real-time usage meters, and self-service plan selection
        </p>
      </div>

      {message && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            backgroundColor: message.type === 'success' ? 'rgba(74, 222, 128, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            color: message.type === 'success' ? '#4ade80' : '#ef4444',
            border: `1px solid ${message.type === 'success' ? 'rgba(74, 222, 128, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
          }}
        >
          {message.text}
        </div>
      )}

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
            value={monthlyLimit.toLocaleString()}
            subtext="Calendar month quota"
            badgeType="blue"
          />
          <StatCard
            title="Daily Safety Limit"
            value={dailyLimit.toLocaleString()}
            subtext="Per-day safety ceiling"
            badgeType="orange"
          />
          <StatCard
            title="Rate Limit"
            value={`${currentPlanData?.rate_limit_per_sec || plan.rate_limit_per_sec || 50}/sec`}
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
          <div style={{ width: '100%', height: '8px', backgroundColor: '#1f1f23', borderRadius: '9999px', overflow: 'hidden' }}>
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
          <div style={{ width: '100%', height: '8px', backgroundColor: '#1f1f23', borderRadius: '9999px', overflow: 'hidden' }}>
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

      {/* Available Plans Side-by-Side Cards (No Payment Gateway) */}
      <div>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
            Select a Plan
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
            Instant tier upgrades without payment gateways or credit cards required
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {availablePlans.map((p) => {
            const isCurrent = p.id === plan.id || p.name === plan.name
            return (
              <div
                key={p.id}
                style={{
                  backgroundColor: 'var(--bg-surface-card, #12141a)',
                  border: `2px solid ${isCurrent ? '#3b82f6' : 'var(--border-subtle, #1f232f)'}`,
                  borderRadius: 'var(--radius-lg, 16px)',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isCurrent ? '0 4px 20px rgba(59, 130, 246, 0.15)' : 'none',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                      {p.name}
                    </h3>
                    {isCurrent && (
                      <span className="badge badge-blue" style={{ fontSize: '11px', padding: '3px 8px' }}>
                        Active Plan
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: '12.5px', color: 'var(--text-muted, #585f73)', minHeight: '36px', margin: '0 0 16px 0' }}>
                    {p.description || 'Full-featured transactional email delivery'}
                  </p>

                  <div style={{ fontSize: '26px', fontWeight: 700, color: '#ffffff', marginBottom: '20px' }}>
                    ₹{p.name.toLowerCase().includes('start') ? '0' : (p.name.toLowerCase().includes('grow') || p.name.toLowerCase().includes('pro')) ? '2,499' : '9,999'}
                    <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-muted, #585f73)' }}>
                      {' '}/month
                    </span>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-subtle, #232325)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f1f3f9' }}>
                      <span style={{ color: '#10b981' }}>✓</span>
                      <span>{(p.monthly_email_limit || 0).toLocaleString()} emails a month</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f1f3f9' }}>
                      <span style={{ color: '#10b981' }}>✓</span>
                      <span>{(isCurrent ? (currentPlanData?.rate_limit_per_sec || p.rate_limit_per_sec || plan.rate_limit_per_sec) : (p.rate_limit_per_sec)) || 50} requests per second</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f1f3f9' }}>
                      <span style={{ color: '#10b981' }}>✓</span>
                      <span>{(p.daily_email_limit || 0).toLocaleString()} emails / day safety ceiling</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f1f3f9' }}>
                      <span style={{ color: '#10b981' }}>✓</span>
                      <span>Priority sending</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f1f3f9' }}>
                      <span style={{ color: '#10b981' }}>✓</span>
                      <span>Email support</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '24px' }}>
                  {isCurrent ? (
                    <button
                      className="btn-secondary"
                      disabled
                      style={{ width: '100%', cursor: 'default', opacity: 0.8 }}
                    >
                      Current plan
                    </button>
                  ) : (
                    <button
                      className="btn-primary"
                      onClick={() => handleSelectPlan(p)}
                      disabled={switchingId === p.id}
                      style={{ width: '100%' }}
                    >
                      {switchingId === p.id ? 'Activating...' : `Choose ${p.name}`}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
