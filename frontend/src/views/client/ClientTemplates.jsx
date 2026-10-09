import React, { useState, useEffect, useCallback, useRef } from 'react'
import { request, ApiError } from '../../api'
import { formatDate } from '../../utils/date'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

export function ClientTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Create Draft Modal / Form State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [eventType, setEventType] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [detectedVars, setDetectedVars] = useState([])
  const [sampleData, setSampleData] = useState({})
  const [previewResult, setPreviewResult] = useState(null)
  const [previewError, setPreviewError] = useState(null)
  const [savingDraft, setSavingDraft] = useState(false)

  // Activate Modal State
  const [templateToActivate, setTemplateToActivate] = useState(null)
  const [activating, setActivating] = useState(false)

  const debounceTimerRef = useRef(null)

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await request('/api/templates')
      setTemplates(data || [])
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to load templates')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // Detect variables debounced when subject or body changes
  useEffect(() => {
    if (!isModalOpen) return
    clearTimeout(debounceTimerRef.current)

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await request('/api/templates/variables', {
          method: 'POST',
          body: { subject, body },
        })
        const vars = res?.variables || []
        setDetectedVars(vars)

        // Initialize sample data for newly detected variables
        setSampleData((prev) => {
          const next = { ...prev }
          vars.forEach((v) => {
            if (!(v in next)) {
              next[v] = `sample_${v}`
            }
          })
          return next
        })
      } catch {
        // Silently ignore detection network error
      }
    }, 300)

    return () => clearTimeout(debounceTimerRef.current)
  }, [subject, body, isModalOpen])

  // Call preview whenever subject, body, or sampleData changes
  useEffect(() => {
    if (!isModalOpen) return
    if (!subject.trim() && !body.trim()) {
      setPreviewResult(null)
      setPreviewError(null)
      return
    }

    let isMounted = true
    const runPreview = async () => {
      try {
        setPreviewError(null)
        const res = await request('/api/templates/preview', {
          method: 'POST',
          body: {
            subject,
            body,
            sample_data: sampleData,
          },
        })
        if (isMounted) {
          setPreviewResult(res)
          setPreviewError(null)
        }
      } catch (err) {
        if (isMounted) {
          if (err instanceof ApiError && err.status === 422) {
            setPreviewError(err.message || 'Missing required variable')
          } else {
            setPreviewError(err.message || 'Preview rendering error')
          }
          setPreviewResult(null)
        }
      }
    }

    const t = setTimeout(runPreview, 250)
    return () => {
      isMounted = false
      clearTimeout(t)
    }
  }, [subject, body, sampleData, isModalOpen])

  const handleOpenCreateModal = (initialEventType = '', initialSubject = '', initialBody = '') => {
    setEventType(initialEventType)
    setSubject(initialSubject || 'Notification for {{ user_name }}')
    setBody(initialBody || 'Hello {{ user_name }},\n\nYour order {{ order_id }} has been processed.')
    setSampleData({ user_name: 'Alex', order_id: '10042' })
    setPreviewResult(null)
    setPreviewError(null)
    setIsModalOpen(true)
  }

  const handleSaveDraft = async (e) => {
    e.preventDefault()
    if (!eventType.trim() || !subject.trim() || !body.trim()) return

    setSavingDraft(true)
    try {
      await request('/api/templates', {
        method: 'POST',
        body: {
          event_type: eventType.trim(),
          subject: subject.trim(),
          body: body.trim(),
        },
      })
      setIsModalOpen(false)
      loadTemplates()
    } catch (err) {
      setPreviewError(err.message || 'Failed to save template draft')
    } finally {
      setSavingDraft(false)
    }
  }

  const handleConfirmActivate = async () => {
    if (!templateToActivate) return
    setActivating(true)
    try {
      await request(`/api/templates/${templateToActivate.id}/activate`, {
        method: 'POST',
      })
      setTemplateToActivate(null)
      loadTemplates()
    } catch (err) {
      alert(err.message || 'Failed to activate template')
    } finally {
      setActivating(false)
    }
  }

  // Group templates by event_type
  const groupedTemplates = templates.reduce((acc, tmpl) => {
    const key = tmpl.event_type || 'default'
    if (!acc[key]) acc[key] = []
    acc[key].push(tmpl)
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
            Templates
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
            Versioned email templates rendered dynamically from notification event payloads
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => handleOpenCreateModal()}
        >
          New template draft
        </button>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Skeleton variant="card" height="120px" count={3} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadTemplates} />
      ) : Object.keys(groupedTemplates).length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Create your first draft template to start sending customized emails."
          actionLabel="Create template draft"
          onAction={() => handleOpenCreateModal()}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {Object.entries(groupedTemplates).map(([type, list]) => (
            <div
              key={type}
              style={{
                backgroundColor: 'var(--bg-surface-card, #12141a)',
                border: '1px solid var(--border-subtle, #1f232f)',
                borderRadius: 'var(--radius-lg, 16px)',
                padding: '20px 24px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff' }}>
                    {type}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted, #585f73)', backgroundColor: '#181b24', padding: '2px 8px', borderRadius: '9999px' }}>
                    {list.length} version{list.length > 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleOpenCreateModal(type)}
                  style={{ fontSize: '12px', padding: '4px 12px' }}
                >
                  + Draft new version
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)', color: 'var(--text-muted, #585f73)' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 500 }}>Version</th>
                      <th style={{ padding: '8px 12px', fontWeight: 500 }}>Status</th>
                      <th style={{ padding: '8px 12px', fontWeight: 500 }}>Subject Preview</th>
                      <th style={{ padding: '8px 12px', fontWeight: 500 }}>Created</th>
                      <th style={{ padding: '8px 12px', fontWeight: 500, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((tmpl) => (
                      <tr key={tmpl.id} style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#ffffff' }}>
                          v{tmpl.version}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {tmpl.is_active ? (
                            <span className="badge badge-green">Active</span>
                          ) : (
                            <span className="badge badge-gray">Draft</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary, #8c93a7)' }}>
                          <span style={{ maxWidth: '320px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tmpl.subject}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted, #585f73)', whiteSpace: 'nowrap' }}>
                          {formatDate(tmpl.created_at)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {!tmpl.is_active ? (
                            <button
                              type="button"
                              className="btn-action-small"
                              onClick={() => setTemplateToActivate(tmpl)}
                            >
                              Activate
                            </button>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>In production</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Draft Template Modal */}
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
              maxWidth: '820px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #1f232f',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                  Create Template Draft
                </h2>
                <div style={{ fontSize: '12px', color: '#8c93a7', marginTop: '2px' }}>
                  Write subject and body using {'{{ variable_name }}'} syntax with live preview
                </div>
              </div>
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

            {/* Modal Body */}
            <form onSubmit={handleSaveDraft} style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, color: '#f1f3f9', marginBottom: '6px' }}>
                  Event Type Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. order_shipped, password_reset, welcome"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
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
                  Subject Template *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Order {{ order_id }} is on its way!"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
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
                  Body Template (Plain text or HTML) *
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Hi {{ user_name }},\n\nWe are preparing your package..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#161922',
                    border: '1px solid #202431',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Detected Variables Chips */}
              <div>
                <div style={{ fontSize: '12px', color: '#8c93a7', marginBottom: '6px' }}>
                  Detected template variables:
                </div>
                {detectedVars.length === 0 ? (
                  <span style={{ fontSize: '12px', color: '#585f73', fontStyle: 'italic' }}>
                    None detected yet. Use {'{{ my_variable }}'} in subject or body.
                  </span>
                ) : (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {detectedVars.map((v) => (
                      <span
                        key={v}
                        style={{
                          backgroundColor: '#1f293d',
                          border: '1px solid #3b82f6',
                          color: '#93c5fd',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                        }}
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Sample Data Inputs */}
              {detectedVars.length > 0 && (
                <div style={{ backgroundColor: '#161922', padding: '14px', borderRadius: '10px', border: '1px solid #202431' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#f1f3f9', marginBottom: '8px' }}>
                    Sample Data for Preview
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                    {detectedVars.map((v) => (
                      <div key={v}>
                        <label style={{ display: 'block', fontSize: '11px', color: '#8c93a7', marginBottom: '3px' }}>
                          {v}
                        </label>
                        <input
                          type="text"
                          value={sampleData[v] || ''}
                          onChange={(e) => {
                            const val = e.target.value
                            setSampleData((prev) => ({ ...prev, [v]: val }))
                          }}
                          style={{
                            width: '100%',
                            padding: '5px 8px',
                            backgroundColor: '#12141a',
                            border: '1px solid #2b3142',
                            borderRadius: '6px',
                            color: '#ffffff',
                            fontSize: '12px',
                            outline: 'none',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing variable inline error message */}
              {previewError && (
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
                  ⚠ {previewError}
                </div>
              )}

              {/* Live Preview Card */}
              {previewResult && !previewError && (
                <div style={{ backgroundColor: '#161922', padding: '14px', borderRadius: '10px', border: '1px solid #202431' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#10b981', marginBottom: '8px' }}>
                    Live Rendered Preview
                  </div>
                  <div style={{ marginBottom: '6px', fontSize: '13px', color: '#ffffff', fontWeight: 600 }}>
                    Subject: {previewResult.rendered_subject}
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      backgroundColor: '#12141a',
                      padding: '10px',
                      borderRadius: '6px',
                      color: '#d1d5db',
                      fontSize: '12px',
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      maxHeight: '120px',
                      overflowY: 'auto',
                    }}
                  >
                    {previewResult.rendered_body}
                  </pre>
                </div>
              )}

              {/* Modal Footer Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
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
                  disabled={savingDraft || !eventType.trim() || !subject.trim() || !body.trim()}
                >
                  {savingDraft ? 'Saving draft...' : 'Save draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Activate Draft */}
      {templateToActivate && (
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
          onClick={() => setTemplateToActivate(null)}
        >
          <div
            style={{
              backgroundColor: '#12141a',
              border: '1px solid #1f232f',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '460px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
              Activate Template v{templateToActivate.version}?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '10px 0 20px 0', lineHeight: 1.5 }}>
              Activating this version for event type <strong style={{ color: '#ffffff' }}>{templateToActivate.event_type}</strong> will immediately route all future notification emails through this template and archive the previous active version.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setTemplateToActivate(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmActivate}
                disabled={activating}
              >
                {activating ? 'Activating...' : 'Yes, activate draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
