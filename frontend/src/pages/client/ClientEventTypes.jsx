import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

export function ClientEventTypes() {
  const [eventTypes, setEventTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Modal create/edit state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingType, setEditingType] = useState(null)
  const [eventTypeName, setEventTypeName] = useState('')
  const [priority, setPriority] = useState(1)
  const [ttlSeconds, setTtlSeconds] = useState('')
  const [retryScheduleStr, setRetryScheduleStr] = useState('[10, 30, 60, 300]')
  const [respectOptOut, setRespectOptOut] = useState(true)
  const [sensitive, setSensitive] = useState(false)
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)

  const loadEventTypes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await request('/api/event-types')
      setEventTypes(data || [])
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to load event types')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEventTypes()
  }, [loadEventTypes])

  const handleOpenModal = (et = null) => {
    setFormError(null)
    if (et) {
      setEditingType(et)
      setEventTypeName(et.event_type || '')
      setPriority(et.priority ?? 1)
      setTtlSeconds(et.ttl_seconds !== null && et.ttl_seconds !== undefined ? String(et.ttl_seconds) : '')
      setRetryScheduleStr(JSON.stringify(et.retry_schedule || [10, 30, 60, 300]))
      setRespectOptOut(et.respect_opt_out ?? true)
      setSensitive(et.sensitive ?? false)
    } else {
      setEditingType(null)
      setEventTypeName('')
      setPriority(1)
      setTtlSeconds('')
      setRetryScheduleStr('[10, 30, 60, 300]')
      setRespectOptOut(true)
      setSensitive(false)
    }
    setIsModalOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setFormError(null)

    const name = eventTypeName.trim()
    if (!name) {
      setFormError('Event type name is required.')
      return
    }

    // Validate retry schedule as valid JSON array of positive ints
    let parsedSchedule = []
    try {
      const parsed = JSON.parse(retryScheduleStr)
      if (!Array.isArray(parsed)) {
        throw new Error('Must be a JSON array')
      }
      for (const val of parsed) {
        if (!Number.isInteger(val) || val <= 0) {
          throw new Error('All elements must be positive integers representing seconds')
        }
      }
      parsedSchedule = parsed
    } catch (err) {
      setFormError(`Invalid retry schedule: ${err.message}. Example: [10, 30, 60, 300]`)
      return
    }

    let parsedTtl = null
    if (ttlSeconds.trim()) {
      const n = parseInt(ttlSeconds.trim(), 10)
      if (isNaN(n) || n <= 0) {
        setFormError('TTL seconds must be a positive integer or left empty.')
        return
      }
      parsedTtl = n
    }

    setSaving(true)
    try {
      await request(`/api/event-types/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: {
          priority: Number(priority),
          ttl_seconds: parsedTtl,
          retry_schedule: parsedSchedule,
          respect_opt_out: Boolean(respectOptOut),
          sensitive: Boolean(sensitive),
        },
      })
      setIsModalOpen(false)
      loadEventTypes()
    } catch (err) {
      setFormError(err.message || 'Failed to save event type')
    } finally {
      setSaving(false)
    }
  }

  const getPriorityBadge = (p) => {
    if (p >= 2) return <span className="badge badge-red">High (2)</span>
    if (p === 1) return <span className="badge badge-orange">Normal (1)</span>
    return <span className="badge badge-gray">Low (0)</span>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
            Event Types
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
            Configure priority tiers, expiry limits, and retry backoffs per notification channel
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => handleOpenModal()}
        >
          New event type
        </button>
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
        {loading ? (
          <Skeleton variant="table-row" count={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={loadEventTypes} />
        ) : eventTypes.length === 0 ? (
          <EmptyState
            title="No event types yet"
            description="Create one to start sending."
            actionLabel="Create event type"
            onAction={() => handleOpenModal()}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)', color: 'var(--text-muted, #585f73)' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Event Type</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Priority</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Expiry (TTL)</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Retry Schedule</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Respect Opt-outs</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Sensitive</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {eventTypes.map((et) => (
                  <tr
                    key={et.event_type}
                    style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)' }}
                  >
                    <td style={{ padding: '12px', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
                      {et.event_type}
                    </td>
                    <td style={{ padding: '12px' }}>{getPriorityBadge(et.priority)}</td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)' }}>
                      {et.ttl_seconds ? `${et.ttl_seconds}s (${Math.round(et.ttl_seconds / 60)}m)` : 'Never expires'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)', fontFamily: 'monospace', fontSize: '12px' }}>
                      {Array.isArray(et.retry_schedule) && et.retry_schedule.length > 0
                        ? JSON.stringify(et.retry_schedule)
                        : 'No retries'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {et.respect_opt_out ? (
                        <span className="badge badge-green">Yes</span>
                      ) : (
                        <span className="badge badge-gray">No</span>
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {et.sensitive ? (
                        <span className="badge badge-orange">🔒 Yes</span>
                      ) : (
                        <span className="badge badge-gray">No</span>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-action-small"
                        onClick={() => handleOpenModal(et)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create / Edit Event Type */}
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
              maxWidth: '560px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                {editingType ? `Edit Event Type: ${editingType.event_type}` : 'New Event Type'}
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

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {!editingType && (
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, color: '#f1f3f9', marginBottom: '6px' }}>
                    Event Type Identifier *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. order_confirmation, auth_token, weekly_digest"
                    value={eventTypeName}
                    onChange={(e) => setEventTypeName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: '#161922',
                      border: '1px solid #202431',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '13px',
                      outline: 'none',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, color: '#f1f3f9', marginBottom: '6px' }}>
                  Priority Tier
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
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
                >
                  <option value={0}>Low (0) - Background bulk digests</option>
                  <option value={1}>Normal (1) - Standard transactional emails</option>
                  <option value={2}>High (2) - Critical alerts and password resets</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, color: '#f1f3f9', marginBottom: '6px' }}>
                  Expiry TTL (seconds, optional)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 900 for 15 minutes, or leave blank"
                  value={ttlSeconds}
                  onChange={(e) => setTtlSeconds(e.target.value)}
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
                  Retry Backoff Schedule (JSON array of seconds) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="[10, 30, 60, 300]"
                  value={retryScheduleStr}
                  onChange={(e) => setRetryScheduleStr(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#161922',
                    border: '1px solid #202431',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                    fontFamily: 'monospace',
                  }}
                />
                <div style={{ fontSize: '11px', color: '#585f73', marginTop: '4px' }}>
                  Must be a JSON array of positive integers, e.g. [5, 15, 60, 300]
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#f1f3f9' }}>
                  <input
                    type="checkbox"
                    checked={respectOptOut}
                    onChange={(e) => setRespectOptOut(e.target.checked)}
                  />
                  <span>Respect recipient opt-out preferences</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#f1f3f9' }}>
                  <input
                    type="checkbox"
                    checked={sensitive}
                    onChange={(e) => setSensitive(e.target.checked)}
                  />
                  <span>Sensitive (redact content in logs and prevent DLQ retries)</span>
                </label>
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
                  {saving ? 'Saving...' : 'Save event type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
