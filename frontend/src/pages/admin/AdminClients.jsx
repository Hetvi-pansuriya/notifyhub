import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

const STATUS_FILTERS = [
  { label: 'All', value: null },
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'disabled' },
]

export function AdminClients({ onSelectClient }) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  const loadClients = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let url = '/admin/clients'
      const params = new URLSearchParams()
      if (search.trim()) params.append('search', search.trim())
      if (statusFilter) params.append('status', statusFilter)
      const qs = params.toString()
      if (qs) url += `?${qs}`

      const data = await request(url)
      setClients(data || [])
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to load clients')
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    loadClients()
  }, [loadClients])

  const handleToggleStatus = async (c, e) => {
    e.stopPropagation()
    const newStatus = c.status === 'active' ? 'disabled' : 'active'
    setTogglingId(c.id)

    // Immediate optimistic update
    setClients((prev) =>
      prev.map((item) => (item.id === c.id ? { ...item, status: newStatus } : item))
    )

    try {
      await request(`/admin/clients/${c.id}`, {
        method: 'PATCH',
        body: { status: newStatus },
      })
    } catch (err) {
      alert(err.message || 'Failed to update client status')
      loadClients()
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
          Client Tenants
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
          Registered tenant organizations, plan assignments, usage quotas, and service controls
        </p>
      </div>

      {/* Main Table Card */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface-card, #12141a)',
          border: '1px solid var(--border-subtle, #1f232f)',
          borderRadius: 'var(--radius-lg, 16px)',
          padding: '24px',
        }}
      >
        {/* Controls row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          {/* Status filter tabs */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.value
              return (
                <button
                  key={f.label}
                  type="button"
                  className={`filter-pill ${active ? 'active' : ''}`}
                  onClick={() => setStatusFilter(f.value)}
                >
                  {f.label}
                </button>
              )
            })}
          </div>

          {/* Search box */}
          <div style={{ minWidth: '260px' }}>
            <input
              type="text"
              placeholder="Search by client name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 14px',
                backgroundColor: '#161922',
                border: '1px solid var(--border-subtle, #1f232f)',
                borderRadius: 'var(--radius-full, 9999px)',
                color: '#ffffff',
                fontSize: '12.5px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {loading ? (
          <Skeleton variant="table-row" count={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={loadClients} />
        ) : clients.length === 0 ? (
          <EmptyState
            title="No clients found"
            description="No client tenants match your current filter or search criteria."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)', color: 'var(--text-muted, #585f73)' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Client</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Plan</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Usage (Monthly)</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Status</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Failed Now</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const limit = c.monthly_email_limit || 10000
                  const sent = c.sent_this_month || 0
                  const pct = Math.min(100, Math.round((sent / limit) * 100))
                  const isPaused = c.status === 'disabled'

                  return (
                    <tr
                      key={c.id}
                      onClick={() => onSelectClient && onSelectClient(c)}
                      style={{
                        borderBottom: '1px solid var(--border-subtle, #1f232f)',
                        cursor: 'pointer',
                        transition: 'background-color 0.12s',
                      }}
                    >
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 600, color: '#ffffff' }}>{c.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted, #585f73)', fontFamily: 'monospace' }}>
                          {c.id}
                        </div>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)' }}>
                        {c.plan_name || 'Starter'}
                      </td>
                      <td style={{ padding: '12px', minWidth: '180px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '4px' }}>
                          <span style={{ color: '#ffffff', fontWeight: 500 }}>
                            {sent.toLocaleString()} / {limit.toLocaleString()} sent
                          </span>
                          <span style={{ color: 'var(--text-muted, #585f73)' }}>{pct}%</span>
                        </div>
                        <div style={{ width: '100%', height: '5px', backgroundColor: '#1b1e2a', borderRadius: '9999px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              backgroundColor: pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : '#3b82f6',
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span className={`badge ${!isPaused ? 'badge-green' : 'badge-orange'}`}>
                          {!isPaused ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        {c.failed_now > 0 ? (
                          <span style={{ color: '#f87171', fontWeight: 600 }}>{c.failed_now}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted, #585f73)' }}>0</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button
                            type="button"
                            className={isPaused ? 'btn-action-small' : 'btn-secondary'}
                            style={{
                              fontSize: '11.5px',
                              padding: '4px 10px',
                              color: isPaused ? '#34d399' : '#fbbf24',
                            }}
                            disabled={togglingId === c.id}
                            onClick={(e) => handleToggleStatus(c, e)}
                          >
                            {isPaused ? 'Resume' : 'Pause'}
                          </button>
                          <button
                            type="button"
                            className="btn-action-small"
                            onClick={(e) => {
                              e.stopPropagation()
                              onSelectClient && onSelectClient(c)
                            }}
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
