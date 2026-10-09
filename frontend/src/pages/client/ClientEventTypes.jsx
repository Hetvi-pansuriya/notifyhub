import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

/**
 * Custom animated toggle switch matching mockup 04_client_event_types.png
 * (White active pill with dark knob, dark inactive pill with muted knob)
 */
function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        if (!disabled && onChange) onChange(!checked)
      }}
      style={{
        width: '38px',
        height: '22px',
        borderRadius: '9999px',
        backgroundColor: checked ? '#ffffff' : '#272b38',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        transition: 'background-color 0.2s ease',
        padding: 0,
        outline: 'none',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      <span
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: checked ? '#0a0d14' : '#8c93a7',
          position: 'absolute',
          left: checked ? '19px' : '3px',
          transition: 'left 0.2s ease, background-color 0.2s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  )
}

const formatExpiry = (ttl) => {
  if (!ttl) return 'Never'
  if (ttl < 60) return `${ttl}s`
  if (ttl < 3600) return `${Math.round(ttl / 60)} minutes`
  if (ttl < 86400) return `${Math.round(ttl / 3600)} hours`
  const days = Math.round(ttl / 86400)
  return days === 1 ? '1 day' : `${days} days`
}

const formatRetry = (schedule) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return 'No retries'
  return schedule
    .map((s) => {
      if (s >= 60) return `${Math.round(s / 60)}m`
      return `${s}s`
    })
    .join(', ')
}

export function ClientEventTypes() {
  const [eventTypes, setEventTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Modal create/edit state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingType, setEditingType] = useState(null)
  const [eventTypeName, setEventTypeName] = useState('')
  const [priority, setPriority] = useState(1) // 2: High, 1: Normal, 0: Low
  const [ttlOption, setTtlOption] = useState('never')
  const [customTtl, setCustomTtl] = useState('')
  const [retryPreset, setRetryPreset] = useState('standard')
  const [customRetry, setCustomRetry] = useState('[5, 10, 20, 40]')
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

  const handleToggle = async (et, field) => {
    const updatedValue = !et[field]
    // Optimistic UI update
    setEventTypes((prev) =>
      prev.map((item) =>
        item.event_type === et.event_type
          ? { ...item, [field]: updatedValue }
          : item
      )
    )

    try {
      await request(`/api/event-types/${encodeURIComponent(et.event_type)}`, {
        method: 'PUT',
        body: {
          priority: et.priority ?? 1,
          ttl_seconds: et.ttl_seconds,
          retry_schedule: et.retry_schedule || [5, 10, 20, 40],
          respect_opt_out: field === 'respect_opt_out' ? updatedValue : et.respect_opt_out,
          sensitive: field === 'sensitive' ? updatedValue : et.sensitive,
        },
      })
    } catch (err) {
      // Revert on failure
      setEventTypes((prev) =>
        prev.map((item) =>
          item.event_type === et.event_type
            ? { ...item, [field]: et[field] }
            : item
        )
      )
      alert(`Failed to update ${field}: ${err.message}`)
    }
  }

  const handleOpenModal = (et = null) => {
    setFormError(null)
    if (et) {
      setEditingType(et)
      setEventTypeName(et.event_type || '')
      setPriority(et.priority ?? 1)
      if (!et.ttl_seconds) {
        setTtlOption('never')
        setCustomTtl('')
      } else if (et.ttl_seconds === 300) {
        setTtlOption('5m')
        setCustomTtl('')
      } else if (et.ttl_seconds === 900) {
        setTtlOption('15m')
        setCustomTtl('')
      } else if (et.ttl_seconds === 172800) {
        setTtlOption('2d')
        setCustomTtl('')
      } else {
        setTtlOption('custom')
        setCustomTtl(String(et.ttl_seconds))
      }

      setCustomRetry(JSON.stringify(et.retry_schedule || [5, 10, 20, 40]))
      setRespectOptOut(et.respect_opt_out ?? true)
      setSensitive(et.sensitive ?? false)
    } else {
      setEditingType(null)
      setEventTypeName('')
      setPriority(1)
      setTtlOption('never')
      setCustomTtl('')
      setCustomRetry('[5, 10, 20, 40]')
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

    let parsedSchedule = [5, 10, 20, 40]
    try {
      const parsed = JSON.parse(customRetry)
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('Must be a non-empty array of positive seconds')
      }
      for (const val of parsed) {
        if (!Number.isInteger(val) || val <= 0) {
          throw new Error('All elements must be positive integers')
        }
      }
      parsedSchedule = parsed
    } catch (err) {
      setFormError(`Invalid retry schedule: ${err.message}. Example: [2, 5] or [5, 10, 20, 40]`)
      return
    }

    let parsedTtl = null
    if (ttlOption === '5m') parsedTtl = 300
    else if (ttlOption === '15m') parsedTtl = 900
    else if (ttlOption === '2d') parsedTtl = 172800
    else if (ttlOption === 'custom' && customTtl.trim()) {
      const n = parseInt(customTtl.trim(), 10)
      if (isNaN(n) || n <= 0) {
        setFormError('TTL must be a positive integer in seconds.')
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

  const renderPriorityBadge = (p) => {
    if (p >= 2) {
      return (
        <span
          style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: '9999px',
            backgroundColor: '#3b1419',
            color: '#f87171',
            fontSize: '11.5px',
            fontWeight: 600,
          }}
        >
          High
        </span>
      )
    }
    if (p === 1) {
      return (
        <span
          style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: '9999px',
            backgroundColor: '#2e2311',
            color: '#f59e0b',
            fontSize: '11.5px',
            fontWeight: 600,
          }}
        >
          Normal
        </span>
      )
    }
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: '9999px',
          backgroundColor: '#181b24',
          color: '#8c93a7',
          fontSize: '11.5px',
          fontWeight: 600,
        }}
      >
        Low
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header matching mockup 04_client_event_types.png */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
            Event types
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
            Choose how urgent each kind of email is and what happens if it fails.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => handleOpenModal()}
          style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 600, borderRadius: '8px' }}
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
          <Skeleton variant="table-row" count={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={loadEventTypes} />
        ) : eventTypes.length === 0 ? (
          <EmptyState
            title="No event types yet"
            description="Create an event type (e.g. otp, welcome_email, report_email) to configure delivery priority."
            actionLabel="New event type"
            onAction={() => handleOpenModal()}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)', color: 'var(--text-muted, #585f73)' }}>
                    <th style={{ padding: '12px 14px', fontWeight: 500 }}>Event type</th>
                    <th style={{ padding: '12px 14px', fontWeight: 500 }}>Priority</th>
                    <th style={{ padding: '12px 14px', fontWeight: 500 }}>Expires after</th>
                    <th style={{ padding: '12px 14px', fontWeight: 500 }}>Retry after</th>
                    <th style={{ padding: '12px 14px', fontWeight: 500 }}>Respect opt-outs</th>
                    <th style={{ padding: '12px 14px', fontWeight: 500 }}>Sensitive</th>
                  </tr>
                </thead>
                <tbody>
                  {eventTypes.map((et) => (
                    <tr
                      key={et.event_type}
                      style={{
                        borderBottom: '1px solid var(--border-subtle, #1f232f)',
                        transition: 'background-color 0.15s',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleOpenModal(et)}
                    >
                      <td style={{ padding: '16px 14px', fontWeight: 600, color: '#ffffff' }}>
                        {et.event_type}
                      </td>
                      <td style={{ padding: '16px 14px' }}>
                        {renderPriorityBadge(et.priority)}
                      </td>
                      <td style={{ padding: '16px 14px', color: 'var(--text-secondary, #8c93a7)' }}>
                        {formatExpiry(et.ttl_seconds)}
                      </td>
                      <td style={{ padding: '16px 14px', color: 'var(--text-secondary, #8c93a7)' }}>
                        {formatRetry(et.retry_schedule)}
                      </td>
                      <td style={{ padding: '16px 14px' }} onClick={(e) => e.stopPropagation()}>
                        <ToggleSwitch
                          checked={Boolean(et.respect_opt_out)}
                          onChange={() => handleToggle(et, 'respect_opt_out')}
                        />
                      </td>
                      <td style={{ padding: '16px 14px' }} onClick={(e) => e.stopPropagation()}>
                        <ToggleSwitch
                          checked={Boolean(et.sensitive)}
                          onChange={() => handleToggle(et, 'sensitive')}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Callout Note matching mockup 04_client_event_types.png */}
            <div
              style={{
                backgroundColor: '#161922',
                border: '1px solid #1f232f',
                borderRadius: '10px',
                padding: '14px 18px',
                fontSize: '13px',
                color: '#8c93a7',
                lineHeight: '1.5',
              }}
            >
              High priority emails like OTP codes always go first, even when thousands are waiting.
            </div>
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
              maxWidth: '520px',
              padding: '28px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                {editingType ? `Edit ${editingType.event_type}` : 'New event type'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#8c93a7', cursor: 'pointer', fontSize: '20px' }}
              >
                ×
              </button>
            </div>

            {formError && (
              <div
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#f87171',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  marginBottom: '18px',
                }}
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                  Event Type Identifier
                </label>
                <input
                  type="text"
                  className="input-base"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  placeholder="e.g. otp, welcome_email, report_email"
                  value={eventTypeName}
                  onChange={(e) => setEventTypeName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  disabled={Boolean(editingType)}
                  required
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #585f73)', marginTop: '4px', display: 'block' }}>
                  Lowercase alphanumeric with underscores. Match the event_type sent to POST /api/events.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                  Dispatch Priority Tier
                </label>
                <select
                  className="input-base"
                  style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#181b24', color: '#ffffff' }}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                >
                  <option value={2}>High (2) — Processed first (e.g. OTP verification, password resets)</option>
                  <option value={1}>Normal (1) — Standard transactional (e.g. welcome emails, alerts)</option>
                  <option value={0}>Low (0) — Background batch (e.g. scheduled reports, newsletters)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                  Expires After (Time-to-Live)
                </label>
                <select
                  className="input-base"
                  style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#181b24', color: '#ffffff', marginBottom: ttlOption === 'custom' ? '8px' : '0' }}
                  value={ttlOption}
                  onChange={(e) => setTtlOption(e.target.value)}
                >
                  <option value="never">Never (Standard transactional)</option>
                  <option value="5m">5 minutes (Recommended for OTP)</option>
                  <option value="15m">15 minutes (Password reset)</option>
                  <option value="2d">2 days (Reports & digests)</option>
                  <option value="custom">Custom duration in seconds...</option>
                </select>
                {ttlOption === 'custom' && (
                  <input
                    type="number"
                    className="input-base"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    placeholder="Duration in seconds (e.g. 300)"
                    value={customTtl}
                    onChange={(e) => setCustomTtl(e.target.value)}
                  />
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                  Retry Schedule (Seconds)
                </label>
                <input
                  type="text"
                  className="input-base"
                  style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  placeholder="[2, 5] or [5, 10, 20, 40] or [60, 300]"
                  value={customRetry}
                  onChange={(e) => setCustomRetry(e.target.value)}
                  required
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #585f73)', marginTop: '4px', display: 'block' }}>
                  JSON array of retry intervals. For OTP use [2, 5], for reports use [60, 300].
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#f1f3f9', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={respectOptOut}
                    onChange={(e) => setRespectOptOut(e.target.checked)}
                  />
                  <span>Respect recipient opt-outs (Unsubscribe honor)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#f1f3f9', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={sensitive}
                    onChange={(e) => setSensitive(e.target.checked)}
                  />
                  <span>Sensitive payload (Mask body in audit logs & UI)</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
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
                  {saving ? 'Saving...' : 'Save settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
