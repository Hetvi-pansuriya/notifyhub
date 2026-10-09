import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

const PAGE_SIZE = 15

export function ClientRecipients() {
  const [recipients, setRecipients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  // Event types for preference toggling
  const [eventTypes, setEventTypes] = useState([])

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [externalId, setExternalId] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  // Preferences modal state
  const [prefRecipient, setPrefRecipient] = useState(null)
  const [prefToggling, setPrefToggling] = useState(false)

  const loadRecipients = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const offset = page * PAGE_SIZE
      let url = `/api/recipients?limit=${PAGE_SIZE + 1}&offset=${offset}`
      if (search.trim()) {
        url += `&search=${encodeURIComponent(search.trim())}`
      }
      const data = await request(url)
      const items = data || []
      if (items.length > PAGE_SIZE) {
        setHasMore(true)
        setRecipients(items.slice(0, PAGE_SIZE))
      } else {
        setHasMore(false)
        setRecipients(items)
      }
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to load recipients')
      setLoading(false)
    }
  }, [search, page])

  useEffect(() => {
    loadRecipients()
  }, [loadRecipients])

  useEffect(() => {
    request('/api/event-types')
      .then((data) => setEventTypes(data || []))
      .catch(() => {})
  }, [])

  const handleOpenAddModal = () => {
    setEditingItem(null)
    setExternalId(`user_${Date.now().toString(36)}`)
    setEmail('')
    setName('')
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (r) => {
    setEditingItem(r)
    setExternalId(r.external_id)
    setEmail(r.email)
    setName(r.name || '')
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleSaveRecipient = async (e) => {
    e.preventDefault()
    setFormError(null)
    if (!externalId.trim() || !email.trim()) {
      setFormError('External ID and Email are required.')
      return
    }

    setSaving(true)
    try {
      await request(`/api/recipients/${encodeURIComponent(externalId.trim())}`, {
        method: 'PUT',
        body: {
          email: email.trim(),
          name: name.trim() || undefined,
        },
      })
      setIsModalOpen(false)
      loadRecipients()
    } catch (err) {
      setFormError(err.message || 'Failed to save recipient')
    } finally {
      setSaving(false)
    }
  }

  const handleTogglePreference = async (r, etName, isCurrentlyOptedOut) => {
    setPrefToggling(true)
    try {
      // If currently opted-out (isCurrentlyOptedOut === true), we want to opt back in (enabled: true)
      // If not opted-out, we want to opt out (enabled: false)
      const newEnabled = isCurrentlyOptedOut ? true : false
      const updated = await request(`/api/recipients/${encodeURIComponent(r.external_id)}/preferences`, {
        method: 'PUT',
        body: {
          event_type: etName,
          enabled: newEnabled,
        },
      })
      // Update local state
      setRecipients((prev) =>
        prev.map((item) => (item.external_id === r.external_id ? updated : item))
      )
      if (prefRecipient && prefRecipient.external_id === r.external_id) {
        setPrefRecipient(updated)
      }
    } catch (err) {
      alert(err.message || 'Failed to update opt-out preference')
    } finally {
      setPrefToggling(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
            Recipients
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
            Audience directory and granular channel unsubscribe/opt-out preferences
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={handleOpenAddModal}
        >
          Add recipient
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
        {/* Search bar */}
        <div style={{ marginBottom: '20px', maxWidth: '320px' }}>
          <input
            type="text"
            placeholder="Search email, name or ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
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

        {loading ? (
          <Skeleton variant="table-row" count={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={loadRecipients} />
        ) : recipients.length === 0 ? (
          <EmptyState
            title="No recipients yet"
            description="Add one to get started."
            actionLabel="Add recipient"
            onAction={handleOpenAddModal}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)', color: 'var(--text-muted, #585f73)' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Recipient Email</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Name</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>External ID</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Opted-out Event Types</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => {
                  const optedOut = r.opted_out_event_types || []
                  return (
                    <tr
                      key={r.external_id}
                      style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)' }}
                    >
                      <td style={{ padding: '12px', fontWeight: 600, color: '#ffffff' }}>
                        {r.email}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)' }}>
                        {r.name || '—'}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-muted, #585f73)', fontFamily: 'monospace' }}>
                        {r.external_id}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {optedOut.length === 0 ? (
                          <span style={{ fontSize: '12px', color: '#10b981' }}>None (receives all)</span>
                        ) : (
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {optedOut.map((et) => (
                              <span
                                key={et}
                                style={{
                                  fontSize: '11px',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                  color: '#f87171',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                }}
                              >
                                {et}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn-action-small"
                            onClick={() => setPrefRecipient(r)}
                          >
                            Preferences
                          </button>
                          <button
                            type="button"
                            className="btn-action-small"
                            onClick={() => handleOpenEditModal(r)}
                          >
                            Edit
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

        {/* Pagination */}
        {!loading && !error && (recipients.length > 0 || page > 0) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-subtle, #1f232f)',
              fontSize: '12.5px',
              color: 'var(--text-muted, #585f73)',
            }}
          >
            <div>Page {page + 1}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                style={{ padding: '4px 12px', fontSize: '12px' }}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
                style={{ padding: '4px 12px', fontSize: '12px' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Add / Edit Recipient */}
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
                {editingItem ? 'Edit Recipient' : 'Add Recipient'}
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

            <form onSubmit={handleSaveRecipient} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, color: '#f1f3f9', marginBottom: '6px' }}>
                  External ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. usr_99420"
                  value={externalId}
                  disabled={Boolean(editingItem)}
                  onChange={(e) => setExternalId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: editingItem ? '#0c0d12' : '#161922',
                    border: '1px solid #202431',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                    fontFamily: 'monospace',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, color: '#f1f3f9', marginBottom: '6px' }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  Full Name (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Jane Doe"
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
                  {saving ? 'Saving...' : 'Save recipient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Opt-Out Preferences per Event Type */}
      {prefRecipient && (
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
          onClick={() => setPrefRecipient(null)}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                  Opt-out Preferences
                </h2>
                <div style={{ fontSize: '12px', color: '#8c93a7', marginTop: '2px' }}>
                  {prefRecipient.email} ({prefRecipient.external_id})
                </div>
              </div>
              <button
                onClick={() => setPrefRecipient(null)}
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

            <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', lineHeight: 1.5, marginBottom: '20px' }}>
              Toggle event types this recipient wishes to unsubscribe from. Deliveries configured with &quot;Respect Opt-outs&quot; will be skipped automatically for this recipient.
            </p>

            {eventTypes.length === 0 ? (
              <div style={{ color: '#8c93a7', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                No event types configured yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                {eventTypes.map((et) => {
                  const isOptedOut = (prefRecipient.opted_out_event_types || []).includes(et.event_type)
                  return (
                    <div
                      key={et.event_type}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        backgroundColor: '#161922',
                        borderRadius: '8px',
                        border: '1px solid #202431',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#ffffff' }}>
                          {et.event_type}
                        </div>
                        <div style={{ fontSize: '11px', color: isOptedOut ? '#f87171' : '#34d399' }}>
                          {isOptedOut ? 'Opted out (Unsubscribed)' : 'Subscribed (Receiving)'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={isOptedOut ? 'btn-secondary' : 'btn-action-small'}
                        disabled={prefToggling}
                        onClick={() => handleTogglePreference(prefRecipient, et.event_type, isOptedOut)}
                        style={{ fontSize: '12px' }}
                      >
                        {isOptedOut ? 'Opt back in' : 'Opt out'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setPrefRecipient(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
