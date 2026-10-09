import React, { useState, useEffect, useCallback } from 'react'
import { request, ApiError } from '../../api'
import { formatDate, formatDateTime, formatRelative, userTimezone } from '../../utils/date'
import { StatCard } from '../../components/StatCard'
import { BarChart } from '../../components/BarChart'
import { ClientUsage } from '../client/ClientUsage'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

export function AdminClientDetail({ clientId, client: initialClient, onBack }) {
  const [activeTab, setActiveTab] = useState('Overview') // 'Overview' | 'Usage' | 'Activity'
  const [client, setClient] = useState(initialClient || null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Overview data
  const [dailySeries, setDailySeries] = useState([])
  const [plans, setPlans] = useState([])
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [updatingPlan, setUpdatingPlan] = useState(false)
  const [togglingStatus, setTogglingStatus] = useState(false)

  // Reset Keys Modal
  const [isResetModalOpen, setIsResetModalOpen] = useState(false)
  const [resettingKeys, setResettingKeys] = useState(false)
  const [newKeyData, setNewKeyData] = useState(null)
  const [copiedKey, setCopiedKey] = useState(false)

  // Activity Tab data
  const [activityData, setActivityData] = useState({ dead_deliveries: [], audit_logs: [] })
  const [loadingActivity, setLoadingActivity] = useState(false)

  // Retry delivery feedback
  const [retryingDelId, setRetryingDelId] = useState(null)

  const idToLoad = clientId || initialClient?.id

  const loadClientData = useCallback(async () => {
    if (!idToLoad) return
    setLoading(true)
    setError(null)
    try {
      const now = new Date()
      const d14 = new Date(now)
      d14.setDate(d14.getDate() - 14)

      const [cRes, pRes, serRes] = await Promise.all([
        request(`/admin/clients/${encodeURIComponent(idToLoad)}`),
        request('/admin/plans'),
        request(
          `/admin/stats/series?from=${encodeURIComponent(d14.toISOString())}&to=${encodeURIComponent(now.toISOString())}&bucket=day&metric=sent&tz=${encodeURIComponent(userTimezone)}&client_id=${encodeURIComponent(idToLoad)}`
        ),
      ])

      setClient(cRes)
      setPlans(pRes || [])
      setSelectedPlanId(cRes.plan_id || '')
      setDailySeries(Array.isArray(serRes) ? serRes : (serRes?.series || []))
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to load client details')
      setLoading(false)
    }
  }, [idToLoad])

  useEffect(() => {
    loadClientData()
  }, [loadClientData])

  // Load Activity data when tab switched to Activity
  useEffect(() => {
    if (activeTab === 'Activity' && idToLoad) {
      setLoadingActivity(true)
      request(`/admin/clients/${encodeURIComponent(idToLoad)}/activity`)
        .then((res) => {
          setActivityData(res || { dead_deliveries: [], audit_logs: [] })
        })
        .catch(() => {})
        .finally(() => setLoadingActivity(false))
    }
  }, [activeTab, idToLoad])

  const handleToggleStatus = async () => {
    if (!client) return
    const newStatus = client.status === 'active' ? 'disabled' : 'active'
    setTogglingStatus(true)
    try {
      const updated = await request(`/admin/clients/${client.id}`, {
        method: 'PATCH',
        body: { status: newStatus },
      })
      setClient(updated)
    } catch (err) {
      alert(err.message || 'Failed to update client status')
    } finally {
      setTogglingStatus(false)
    }
  }

  const handleChangePlan = async (e) => {
    e.preventDefault()
    if (!selectedPlanId || selectedPlanId === client.plan_id) return
    setUpdatingPlan(true)
    try {
      const updated = await request(`/admin/clients/${client.id}`, {
        method: 'PATCH',
        body: { plan_id: selectedPlanId },
      })
      setClient(updated)
      alert('Plan updated successfully!')
    } catch (err) {
      alert(err.message || 'Failed to update client plan')
    } finally {
      setUpdatingPlan(false)
    }
  }

  const handleResetKeys = async () => {
    setResettingKeys(true)
    try {
      const res = await request(`/admin/clients/${client.id}/reset-keys`, {
        method: 'POST',
      })
      setNewKeyData(res)
    } catch (err) {
      alert(err.message || 'Failed to reset API keys')
      setIsResetModalOpen(false)
    } finally {
      setResettingKeys(false)
    }
  }

  const handleRetryDelivery = async (delId) => {
    setRetryingDelId(delId)
    try {
      await request(`/api/deliveries/${delId}/retry`, { method: 'POST' })
      alert('Delivery re-queued successfully!')
      loadClientData()
      if (activeTab === 'Activity') {
        const act = await request(`/admin/clients/${idToLoad}/activity`)
        setActivityData(act || { dead_deliveries: [], audit_logs: [] })
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        alert('Delivery is already queued or cannot be retried.')
      } else {
        alert(err.message || 'Failed to retry delivery')
      }
    } finally {
      setRetryingDelId(null)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Skeleton variant="card" height="90px" />
        <Skeleton variant="card" height="110px" />
        <Skeleton variant="card" height="260px" />
      </div>
    )
  }

  if (error || !client) {
    return <ErrorState message={error || 'Client not found'} onRetry={loadClientData} />
  }

  const isPaused = client.status === 'disabled'
  const monthlyLimit = client.monthly_email_limit || 10000
  const sentThisMonth = client.sent_this_month || 0
  const monthlyPct = Math.min(100, Math.round((sentThisMonth / monthlyLimit) * 100))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Back Link */}
      <div>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text-secondary, #8c93a7)',
            fontSize: '13px',
            cursor: 'pointer',
            padding: 0,
            background: 'none',
            border: 'none',
          }}
        >
          &larr; Back to Clients
        </button>
      </div>

      {/* Header following 11_admin_client_detail.png */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
            {client.name}
          </h1>

          {/* Copyable ID Pill */}
          <div
            onClick={() => {
              navigator.clipboard.writeText(client.id)
              alert('Client ID copied to clipboard!')
            }}
            title="Click to copy client ID"
            style={{
              padding: '4px 10px',
              backgroundColor: '#161922',
              border: '1px solid #202431',
              borderRadius: '9999px',
              fontSize: '11.5px',
              color: '#8c93a7',
              fontFamily: 'monospace',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>{client.id}</span>
            <span style={{ fontSize: '10px' }}>📋</span>
          </div>

          {/* Status Pill */}
          <span className={`badge ${!isPaused ? 'badge-green' : 'badge-orange'}`}>
            {!isPaused ? 'Active' : 'Paused'}
          </span>
        </div>

        {/* Action button */}
        <button
          type="button"
          className={isPaused ? 'btn-primary' : 'btn-secondary'}
          disabled={togglingStatus}
          onClick={handleToggleStatus}
        >
          {togglingStatus ? 'Updating...' : isPaused ? 'Resume Client' : 'Pause Client'}
        </button>
      </div>

      {/* Tabs Row: Overview, Usage, Activity (NO PAYMENTS) */}
      <div style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)', display: 'flex', gap: '24px' }}>
        {['Overview', 'Usage', 'Activity'].map((tab) => {
          const isActive = activeTab === tab
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 4px',
                fontSize: '13.5px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#ffffff' : 'var(--text-secondary, #8c93a7)',
                borderBottom: isActive ? '2px solid #ffffff' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
              }}
            >
              {tab}
            </button>
          )
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'Overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 4 Overview Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <StatCard
              title="Plan"
              value={client.plan_name || 'Starter'}
              subtext={`${client.monthly_email_limit?.toLocaleString()} / mo · ${client.rate_limit_per_sec}/s`}
              badgeType="blue"
            />
            <div
              style={{
                backgroundColor: 'var(--bg-surface-card, #12141a)',
                border: '1px solid var(--border-subtle, #1f232f)',
                borderRadius: 'var(--radius-lg, 16px)',
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #8c93a7)', marginBottom: '8px' }}>
                Emails this month
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#ffffff', lineHeight: 1.1 }}>
                {sentThisMonth.toLocaleString()}
                <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted, #585f73)', marginLeft: '6px' }}>
                  / {monthlyLimit.toLocaleString()} ({monthlyPct}%)
                </span>
              </div>
              <div style={{ width: '100%', height: '6px', backgroundColor: '#1b1e2a', borderRadius: '9999px', overflow: 'hidden', marginTop: '12px' }}>
                <div
                  style={{
                    width: `${monthlyPct}%`,
                    height: '100%',
                    backgroundColor: monthlyPct > 90 ? '#ef4444' : '#3b82f6',
                  }}
                />
              </div>
            </div>

            <StatCard
              title="Rate Limit"
              value={`${client.rate_limit_per_sec || 50}/s`}
              subtext={`${client.rejections_today || 0} throttled hits (429) today`}
              badgeType={client.rejections_today > 0 ? 'red' : 'gray'}
            />

            <StatCard
              title="Failed now"
              value={client.failed_now ?? 0}
              subtext="Dead deliveries in DLQ"
              badgeType={client.failed_now > 0 ? 'red' : 'green'}
            />
          </div>

          {/* Emails per day (last 14 days) Chart Card */}
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
                Emails per day (Last 14 days)
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', margin: '2px 0 0 0' }}>
                Daily sent volume for {client.name}
              </p>
            </div>
            <BarChart
              data={dailySeries}
              height={200}
              barColor="#3b82f6"
              unit="emails"
              emptyMessage="No emails dispatched in the last 14 days."
            />
          </div>

          {/* Service Control Card */}
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
                Service Control
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', margin: '2px 0 0 0' }}>
                Administrative overrides for client tenant operation, plan tier, and security credentials
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
              {/* Change Plan Form */}
              <form onSubmit={handleChangePlan} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#f1f3f9' }}>
                  Assigned Subscription Plan
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={selectedPlanId}
                    onChange={(e) => setSelectedPlanId(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      backgroundColor: '#161922',
                      border: '1px solid #202431',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.monthly_email_limit?.toLocaleString()}/mo, {p.rate_limit_per_second}/s)
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={updatingPlan || selectedPlanId === client.plan_id}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {updatingPlan ? 'Saving...' : 'Change plan'}
                  </button>
                </div>
              </form>

              {/* Reset Keys */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#f1f3f9' }}>
                  API Key Rotation & Revocation
                </label>
                <div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setNewKeyData(null)
                      setIsResetModalOpen(true)
                    }}
                  >
                    Reset API keys
                  </button>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', marginLeft: '12px' }}>
                    Revokes all active keys immediately
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USAGE (REUSED COMPONENT) */}
      {activeTab === 'Usage' && (
        <ClientUsage clientId={client.id} />
      )}

      {/* TAB 3: ACTIVITY */}
      {activeTab === 'Activity' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Recent Failures Section */}
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
                Recent Failed Deliveries
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', margin: '2px 0 0 0' }}>
                Deliveries from this client that failed and moved to the dead-letter queue
              </p>
            </div>

            {activityData.dead_deliveries?.length === 0 ? (
              <EmptyState
                title="No recent failures"
                description="This client has no dead-letter deliveries."
                style={{ minHeight: '140px', padding: '20px' }}
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)', color: 'var(--text-muted, #585f73)' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 500 }}>Recipient</th>
                      <th style={{ padding: '8px 12px', fontWeight: 500 }}>Error Reason</th>
                      <th style={{ padding: '8px 12px', fontWeight: 500 }}>Attempts</th>
                      <th style={{ padding: '8px 12px', fontWeight: 500, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityData.dead_deliveries.map((d) => (
                      <tr key={d.id} style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)' }}>
                        <td style={{ padding: '10px 12px', color: '#ffffff', fontWeight: 500 }}>
                          {d.to_email || d.recipient_email}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#f87171' }}>
                          {d.last_error || 'Maximum retries exhausted'}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary, #8c93a7)' }}>
                          {d.attempt_count ?? 0}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn-action-small"
                            disabled={retryingDelId === d.id}
                            onClick={() => handleRetryDelivery(d.id)}
                          >
                            {retryingDelId === d.id ? 'Sending...' : 'Send again'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Audit Log Rows for this client */}
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
                Audit History
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', margin: '2px 0 0 0' }}>
                Administrative modifications and security events recorded for {client.name}
              </p>
            </div>

            {loadingActivity ? (
              <Skeleton variant="table-row" count={4} />
            ) : activityData.audit_logs?.length === 0 ? (
              <EmptyState
                title="No audit events recorded"
                description="Events such as plan changes, pauses, and key resets will appear here."
                style={{ minHeight: '140px', padding: '20px' }}
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)', color: 'var(--text-muted, #585f73)' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 500 }}>Time</th>
                      <th style={{ padding: '8px 12px', fontWeight: 500 }}>Actor</th>
                      <th style={{ padding: '8px 12px', fontWeight: 500 }}>Action</th>
                      <th style={{ padding: '8px 12px', fontWeight: 500 }}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityData.audit_logs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)' }}>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted, #585f73)', whiteSpace: 'nowrap' }}>
                          {formatDateTime(log.created_at)}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#ffffff', fontWeight: 500 }}>
                          {log.actor_email}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span className="badge badge-gray">{log.action}</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary, #8c93a7)' }}>
                          {log.detail}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Reset API Keys */}
      {isResetModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => {
            if (!newKeyData) setIsResetModalOpen(false)
          }}
        >
          <div
            style={{
              backgroundColor: '#12141a',
              border: '1px solid #1f232f',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {!newKeyData ? (
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                  Reset API Keys for {client.name}?
                </h3>
                <p style={{ fontSize: '13px', color: '#f87171', margin: '12px 0 20px 0', lineHeight: 1.5 }}>
                  ⚠ This will instantly revoke all existing active API keys for this client. Any external application using the previous keys will fail immediately until updated.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsResetModalOpen(false)}
                    disabled={resettingKeys}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ backgroundColor: '#ef4444', color: '#ffffff', borderColor: '#ef4444' }}
                    onClick={handleResetKeys}
                    disabled={resettingKeys}
                  >
                    {resettingKeys ? 'Revoking & Generating...' : 'Confirm Reset Keys'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                  New API Key Generated
                </h3>
                <p style={{ fontSize: '13px', color: '#fbbf24', margin: '8px 0 16px 0' }}>
                  Copy this key now. For security, you will not be able to view this raw key again.
                </p>

                <div style={{ position: 'relative', marginBottom: '20px' }}>
                  <div
                    style={{
                      backgroundColor: '#161922',
                      border: '1px solid #202431',
                      borderRadius: '8px',
                      padding: '12px',
                      fontSize: '12.5px',
                      color: '#ffffff',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                    }}
                  >
                    {newKeyData.api_key}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={async () => {
                      if (newKeyData.api_key) {
                        await navigator.clipboard.writeText(newKeyData.api_key)
                        setCopiedKey(true)
                        setTimeout(() => setCopiedKey(false), 2000)
                      }
                    }}
                    style={{ marginTop: '8px', fontSize: '12px' }}
                  >
                    {copiedKey ? '✓ Copied to clipboard' : 'Copy Key'}
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setIsResetModalOpen(false)
                      setNewKeyData(null)
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
