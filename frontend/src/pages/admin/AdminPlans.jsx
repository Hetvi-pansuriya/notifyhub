import React, { useState, useEffect, useCallback } from 'react'
import { request, ApiError } from '../../api'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

export function AdminPlans() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Create / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState(null)
  const [name, setName] = useState('')
  const [monthlyLimit, setMonthlyLimit] = useState(10000)
  const [dailyLimit, setDailyLimit] = useState(1000)
  const [rateLimit, setRateLimit] = useState(50)
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)

  const loadPlans = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await request('/admin/plans')
      setPlans(data || [])
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to load plans')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPlans()
  }, [loadPlans])

  const handleOpenModal = (plan = null) => {
    setFormError(null)
    if (plan) {
      setEditingPlan(plan)
      setName(plan.name)
      setMonthlyLimit(plan.monthly_email_limit)
      setDailyLimit(plan.daily_email_limit)
      setRateLimit(plan.rate_limit_per_second || plan.rate_limit_per_sec || 50)
    } else {
      setEditingPlan(null)
      setName('')
      setMonthlyLimit(10000)
      setDailyLimit(1000)
      setRateLimit(50)
    }
    setIsModalOpen(true)
  }

  const handleSavePlan = async (e) => {
    e.preventDefault()
    setFormError(null)

    if (!name.trim()) {
      setFormError('Plan name is required.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        monthly_email_limit: Number(monthlyLimit),
        daily_email_limit: Number(dailyLimit),
        rate_limit_per_sec: Number(rateLimit),
      }

      if (editingPlan) {
        await request(`/admin/plans/${editingPlan.id}`, {
          method: 'PATCH',
          body: payload,
        })
      } else {
        await request('/admin/plans', {
          method: 'POST',
          body: payload,
        })
      }

      setIsModalOpen(false)
      loadPlans()
    } catch (err) {
      setFormError(err.message || 'Failed to save plan')
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePlan = async (plan) => {
    if (plan.clients_count > 0) return
    if (!window.confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) return

    try {
      await request(`/admin/plans/${plan.id}`, { method: 'DELETE' })
      loadPlans()
    } catch (err) {
      alert(err.message || 'Failed to delete plan')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
            Subscription Plans
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
            Configure capacity tiers, rate limits, and safety limits assigned to tenant organizations
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => handleOpenModal()}
        >
          New plan
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <Skeleton variant="card" height="180px" />
          <Skeleton variant="card" height="180px" />
          <Skeleton variant="card" height="180px" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadPlans} />
      ) : plans.length === 0 ? (
        <EmptyState
          title="No plans configured"
          description="Create your first subscription plan tier to assign limits to tenants."
          actionLabel="Create plan"
          onAction={() => handleOpenModal()}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {plans.map((p) => {
            const hasClients = (p.clients_count || 0) > 0
            return (
              <div
                key={p.id}
                style={{
                  backgroundColor: 'var(--bg-surface-card, #12141a)',
                  border: '1px solid var(--border-subtle, #1f232f)',
                  borderRadius: 'var(--radius-lg, 16px)',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff' }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: '11px', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '9999px', fontWeight: 600 }}>
                      {p.clients_count || 0} client{p.clients_count === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: 'var(--text-secondary, #8c93a7)', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Monthly Email Limit:</span>
                      <strong style={{ color: '#ffffff' }}>{(p.monthly_email_limit || 0).toLocaleString()}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Daily Safety Ceiling:</span>
                      <strong style={{ color: '#ffffff' }}>{(p.daily_email_limit || 0).toLocaleString()}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Rate Limit Throttling:</span>
                      <strong style={{ color: '#ffffff' }}>{p.rate_limit_per_second || p.rate_limit_per_sec || 50} req/s</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-subtle, #1f232f)', paddingTop: '16px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleOpenModal(p)}
                    style={{ fontSize: '12px', padding: '4px 12px' }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-action-small"
                    disabled={hasClients}
                    title={hasClients ? `${p.clients_count} clients currently assigned to this plan` : 'Delete plan'}
                    onClick={() => handleDeletePlan(p)}
                    style={{
                      fontSize: '12px',
                      padding: '4px 12px',
                      color: hasClients ? 'var(--text-muted, #585f73)' : '#f87171',
                      cursor: hasClients ? 'not-allowed' : 'pointer',
                      opacity: hasClients ? 0.5 : 1,
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: Create / Edit Plan */}
      {isModalOpen && (
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
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#12141a',
              border: '1px solid #1f232f',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                {editingPlan ? `Edit Plan: ${editingPlan.name}` : 'New Subscription Plan'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8c93a7',
                  fontSize: '20px',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSavePlan} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, color: '#f1f3f9', marginBottom: '6px' }}>
                  Plan Tier Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Starter, Growth, Enterprise"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#161922',
                    border: '1px solid #202431',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, color: '#f1f3f9', marginBottom: '6px' }}>
                  Monthly Email Limit *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={monthlyLimit}
                  onChange={(e) => setMonthlyLimit(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#161922',
                    border: '1px solid #202431',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, color: '#f1f3f9', marginBottom: '6px' }}>
                  Daily Safety Limit *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#161922',
                    border: '1px solid #202431',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, color: '#f1f3f9', marginBottom: '6px' }}>
                  Rate Limit (req/sec) *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={rateLimit}
                  onChange={(e) => setRateLimit(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#161922',
                    border: '1px solid #202431',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              {formError && (
                <div
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: '#f87171',
                    fontSize: '12.5px',
                  }}
                >
                  ⚠ {formError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
