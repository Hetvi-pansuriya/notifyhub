import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
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
  const [dailyLimit, setDailyLimit] = useState(30)
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
      setDailyLimit(30)
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
      setIsModalOpen(false)
      loadPlans()
    } catch (err) {
      setFormError(err.message || 'Failed to delete plan')
    }
  }

  // Price helper based on plan name/tier matching mockup 12_admin_plans.png
  const getPlanPrice = (planName) => {
    const n = (planName || '').toLowerCase()
    if (n.includes('start')) return '0'
    if (n.includes('grow') || n.includes('pro')) return '2,499'
    if (n.includes('scale') || n.includes('enterpr')) return '9,999'
    return '1,999'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Skeleton variant="text" width="120px" height="28px" />
          <Skeleton variant="button" width="100px" height="36px" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <Skeleton variant="card" height="280px" />
          <Skeleton variant="card" height="280px" />
          <Skeleton variant="card" height="280px" />
        </div>
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadPlans} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header matching mockup 12_admin_plans.png */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
            Plans
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary, #8c93a7)', margin: '6px 0 0 0' }}>
            The subscription plans NotifyHub offers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleOpenModal()}
          style={{
            backgroundColor: '#ffffff',
            color: '#0a0d14',
            border: 'none',
            borderRadius: '9999px',
            padding: '8px 20px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          New plan
        </button>
      </div>

      {/* 3 Plans Cards Grid */}
      {plans.length === 0 ? (
        <EmptyState
          title="No subscription plans configured"
          description="Create your first subscription plan tier to assign limits to tenants."
          actionLabel="New plan"
          onAction={() => handleOpenModal()}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {plans.map((p) => {
            const price = getPlanPrice(p.name)
            return (
              <div
                key={p.id}
                style={{
                  backgroundColor: 'var(--bg-surface-card, #12141a)',
                  border: '1px solid var(--border-subtle, #1f232f)',
                  borderRadius: '16px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '260px',
                }}
              >
                <div>
                  {/* Card Title & Edit button */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '17px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                      {p.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => handleOpenModal(p)}
                      style={{
                        backgroundColor: '#1b1f2b',
                        color: '#d1d5db',
                        border: '1px solid #2d3345',
                        borderRadius: '8px',
                        padding: '4px 14px',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                  </div>

                  {/* Price */}
                  <div style={{ marginBottom: '24px' }}>
                    <span style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
                      ₹{price}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary, #8c93a7)', marginLeft: '4px' }}>
                      /month
                    </span>
                  </div>

                  {/* Features list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: 'var(--text-secondary, #9aa1b5)' }}>
                    <div>{(p.monthly_email_limit || 0).toLocaleString()} emails a month</div>
                    <div>{p.rate_limit_per_second || p.rate_limit_per_sec || 50} requests per second</div>
                    <div>Unlimited templates</div>
                  </div>
                </div>

                {/* Clients count at bottom */}
                <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle, #1f232f)', fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
                  {p.clients_count || 0} client{p.clients_count === 1 ? '' : 's'} on this plan
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer Notice Banner matching mockup 12_admin_plans.png */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface-card, #12141a)',
          border: '1px solid var(--border-subtle, #1f232f)',
          borderRadius: '12px',
          padding: '16px 20px',
          fontSize: '13px',
          color: 'var(--text-secondary, #8c93a7)',
        }}
      >
        Changing a plan affects its clients from their next billing date.
      </div>

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
            padding: '16px',
          }}
          onClick={() => !saving && setIsModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface-card, #12141a)',
              border: '1px solid var(--border-subtle, #1f232f)',
              borderRadius: 'var(--radius-lg, 16px)',
              width: '100%',
              maxWidth: '460px',
              padding: '28px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                {editingPlan ? `Edit ${editingPlan.name}` : 'New Plan'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted, #585f73)',
                  cursor: 'pointer',
                  fontSize: '20px',
                  padding: 0,
                }}
              >
                &times;
              </button>
            </div>

            {formError && (
              <div
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#ef4444',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  marginBottom: '16px',
                }}
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleSavePlan} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #8c93a7)', marginBottom: '6px' }}>
                  Plan Name *
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Starter, Growth, Scale"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #8c93a7)', marginBottom: '6px' }}>
                  Monthly Email Limit *
                </label>
                <input
                  type="number"
                  className="input-field"
                  value={monthlyLimit}
                  onChange={(e) => setMonthlyLimit(e.target.value)}
                  min="1"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #8c93a7)', marginBottom: '6px' }}>
                  Daily Safety Limit *
                </label>
                <input
                  type="number"
                  className="input-field"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  min="1"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #8c93a7)', marginBottom: '6px' }}>
                  Rate Limit (req/sec) *
                </label>
                <input
                  type="number"
                  className="input-field"
                  value={rateLimit}
                  onChange={(e) => setRateLimit(e.target.value)}
                  min="1"
                  max="10000"
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: editingPlan && editingPlan.clients_count === 0 ? 'space-between' : 'flex-end', alignItems: 'center', marginTop: '12px' }}>
                {editingPlan && editingPlan.clients_count === 0 && (
                  <button
                    type="button"
                    onClick={() => handleDeletePlan(editingPlan)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      fontSize: '13px',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Delete Plan
                  </button>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsModalOpen(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : editingPlan ? 'Save changes' : 'Create plan'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
