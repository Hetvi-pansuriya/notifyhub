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

  // Selected template being edited / previewed in right panel
  const [selectedTemplate, setSelectedTemplate] = useState(null)

  // Editor fields
  const [eventType, setEventType] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sampleDataStr, setSampleDataStr] = useState('{\n  "name": "Aarav",\n  "otp_code": "849201"\n}')
  
  // Preview & feedback
  const [detectedVars, setDetectedVars] = useState([])
  const [previewResult, setPreviewResult] = useState(null)
  const [previewError, setPreviewError] = useState(null)
  const [showRenderedPreview, setShowRenderedPreview] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  // New template modal / drawer state if user wants to create from scratch
  const [isCreatingNew, setIsCreatingNew] = useState(false)

  const debounceTimerRef = useRef(null)

  const loadTemplates = useCallback(async (selectId = null) => {
    setLoading(true)
    setError(null)
    try {
      const data = await request('/api/templates')
      const tmpls = data || []
      setTemplates(tmpls)

      // Select template: either requested selectId, currently selected, or first in list
      if (tmpls.length > 0) {
        let toSelect = null
        if (selectId) {
          toSelect = tmpls.find((t) => t.id === selectId)
        } else if (selectedTemplate) {
          toSelect = tmpls.find((t) => t.id === selectedTemplate.id)
        }
        if (!toSelect) {
          // Default to first active template or first template
          toSelect = tmpls.find((t) => t.status === 'active') || tmpls[0]
        }
        selectTemplateForEdit(toSelect)
      } else {
        setSelectedTemplate(null)
      }
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to load templates')
      setLoading(false)
    }
  }, [selectedTemplate])

  useEffect(() => {
    loadTemplates()
  }, [])

  const selectTemplateForEdit = (tmpl) => {
    if (!tmpl) return
    setSelectedTemplate(tmpl)
    setIsCreatingNew(false)
    setEventType(tmpl.event_type || '')
    setSubject(tmpl.subject || '')
    setBody(tmpl.body || '')
    setShowRenderedPreview(false)
    setPreviewResult(null)
    setPreviewError(null)
    setFeedback(null)

    // Build intelligent sample data JSON based on event type and detected variables
    let defaultSample = {}
    if (tmpl.event_type === 'otp') {
      defaultSample = { name: 'Aarav', otp_code: '849201' }
    } else if (tmpl.event_type === 'welcome_email') {
      defaultSample = { name: 'Aarav', app_name: 'NotifyHub' }
    } else if (tmpl.event_type === 'report_email') {
      defaultSample = { name: 'Aarav', report_title: 'Weekly Performance Report', period: 'October 2026', summary: '1,420 emails dispatched with 99.8% inbox delivery' }
    } else if (tmpl.event_type === 'password_reset') {
      defaultSample = { name: 'Aarav', reset_url: 'https://app.notifyhub.local/reset-password?token=sec_9f82a' }
    } else {
      defaultSample = { name: 'Aarav', user_id: 'usr_49102' }
    }
    setSampleDataStr(JSON.stringify(defaultSample, null, 2))
  }

  // Detect variables debounced when subject or body changes
  useEffect(() => {
    clearTimeout(debounceTimerRef.current)
    if (!subject.trim() && !body.trim()) {
      setDetectedVars([])
      return
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await request('/api/templates/variables', {
          method: 'POST',
          body: { subject, body },
        })
        const vars = res?.variables || []
        setDetectedVars(vars)

        // If sampleDataStr is missing any of the detected variables, append them safely
        try {
          const currentData = JSON.parse(sampleDataStr)
          let changed = false
          vars.forEach((v) => {
            if (!(v in currentData)) {
              currentData[v] = `sample_${v}`
              changed = true
            }
          })
          if (changed) {
            setSampleDataStr(JSON.stringify(currentData, null, 2))
          }
        } catch {
          // If JSON is currently invalid while user is typing, ignore
        }
      } catch {
        // Silently ignore detection network error
      }
    }, 300)

    return () => clearTimeout(debounceTimerRef.current)
  }, [subject, body])

  const handleStartNewTemplate = () => {
    setIsCreatingNew(true)
    setSelectedTemplate(null)
    setEventType('new_event')
    setSubject('Notification for {{ name }}')
    setBody('Hello {{ name }},\n\nYour update is ready.')
    setSampleDataStr(JSON.stringify({ name: 'Aarav' }, null, 2))
    setShowRenderedPreview(false)
    setPreviewResult(null)
    setPreviewError(null)
    setFeedback(null)
  }

  const handlePreview = async () => {
    setPreviewError(null)
    setFeedback(null)

    let parsedSample = {}
    try {
      parsedSample = JSON.parse(sampleDataStr)
    } catch (err) {
      setPreviewError(`Invalid sample data JSON: ${err.message}`)
      setShowRenderedPreview(false)
      return
    }

    try {
      const res = await request('/api/templates/preview', {
        method: 'POST',
        body: {
          subject,
          body,
          sample_data: parsedSample,
        },
      })
      setPreviewResult(res)
      setShowRenderedPreview(true)
    } catch (err) {
      setShowRenderedPreview(false)
      setPreviewError(err.message || 'Template rendering failed. Check for missing variables.')
    }
  }

  const handleSaveDraft = async () => {
    setActionLoading(true)
    setFeedback(null)
    setPreviewError(null)
    try {
      let saved = null
      if (isCreatingNew || !selectedTemplate || selectedTemplate.status === 'active') {
        // Create new draft version
        saved = await request('/api/templates', {
          method: 'POST',
          body: {
            event_type: eventType.trim(),
            subject: subject.trim(),
            body: body.trim(),
          },
        })
        setFeedback({ type: 'success', text: `Saved as draft (v${saved.version}) for '${saved.event_type}'.` })
      } else {
        // Update existing draft
        saved = await request(`/api/templates/${selectedTemplate.id}`, {
          method: 'PATCH',
          body: {
            subject: subject.trim(),
            body: body.trim(),
            status: 'draft',
          },
        })
        setFeedback({ type: 'success', text: `Draft v${saved.version} updated successfully.` })
      }

      await loadTemplates(saved?.id)
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Failed to save draft template.' })
    } finally {
      setActionLoading(false)
    }
  }

  const handleMakeActive = async () => {
    setActionLoading(true)
    setFeedback(null)
    setPreviewError(null)
    try {
      let activeTmpl = null
      if (isCreatingNew || !selectedTemplate) {
        // Create new draft and activate
        const created = await request('/api/templates', {
          method: 'POST',
          body: {
            event_type: eventType.trim(),
            subject: subject.trim(),
            body: body.trim(),
          },
        })
        activeTmpl = await request(`/api/templates/${created.id}/activate`, { method: 'POST' })
      } else {
        // Update subject and body, and activate in one operation
        activeTmpl = await request(`/api/templates/${selectedTemplate.id}`, {
          method: 'PATCH',
          body: {
            subject: subject.trim(),
            body: body.trim(),
            status: 'active',
          },
        })
      }

      setFeedback({
        type: 'success',
        text: `Active! All future emails for '${activeTmpl.event_type}' will use this template.`,
      })
      await loadTemplates(activeTmpl?.id)
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Failed to activate template.' })
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header matching mockup 03_client_templates.png */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
            Templates
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
            Write your emails once. We fill in the details every time.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={handleStartNewTemplate}
          style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 600, borderRadius: '8px' }}
        >
          New template
        </button>
      </div>

      {/* Workflow Explanation Banner */}
      <div
        style={{
          backgroundColor: '#161922',
          border: '1px solid #1f232f',
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div style={{ fontSize: '13px', color: '#8c93a7', lineHeight: '1.5' }}>
          <strong style={{ color: '#ffffff' }}>How templates work:</strong> Your client application sends transactional emails by calling <code style={{ color: '#60a5fa', backgroundColor: '#10141f', padding: '2px 6px', borderRadius: '4px' }}>POST /api/events</code> with an event type (e.g. <code style={{ color: '#60a5fa' }}>otp</code>, <code style={{ color: '#60a5fa' }}>report_email</code>). NotifyHub automatically renders the <span style={{ color: '#10b981', fontWeight: 600 }}>Active</span> template with the recipient's variables. You do not need to change code on your server when updating templates here.
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <Skeleton variant="card" height="420px" />
          <Skeleton variant="card" height="420px" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadTemplates} />
      ) : (
        /* Side-by-Side 2-Column Split matching 03_client_templates.png */
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 45%) 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Left Column: Template List */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface-card, #12141a)',
              border: '1px solid var(--border-subtle, #1f232f)',
              borderRadius: 'var(--radius-lg, 16px)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted, #585f73)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
              Configured Templates ({templates.length})
            </div>

            {templates.map((tmpl) => {
              const isSelected = selectedTemplate?.id === tmpl.id && !isCreatingNew
              const isActive = tmpl.status === 'active'

              let subtext = 'Draft · Not live yet'
              if (isActive) {
                if (tmpl.event_type === 'otp') {
                  subtext = 'Sensitive · contents hidden after sending'
                } else if (tmpl.event_type === 'welcome_email') {
                  subtext = 'Sent when someone signs up'
                } else if (tmpl.event_type === 'report_email') {
                  subtext = 'Automated report sending notification'
                } else {
                  subtext = 'Active template in production'
                }
              }

              return (
                <div
                  key={tmpl.id}
                  onClick={() => selectTemplateForEdit(tmpl)}
                  style={{
                    backgroundColor: isSelected ? '#171a23' : '#14161f',
                    border: `1.5px solid ${isSelected ? '#3b82f6' : '#1f232f'}`,
                    borderRadius: '12px',
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#ffffff' }}>
                        {tmpl.event_type}
                      </span>
                      <span style={{ fontSize: '11px', color: '#8c93a7', backgroundColor: '#1e2230', padding: '1px 6px', borderRadius: '4px' }}>
                        v{tmpl.version}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#8c93a7', marginTop: '4px' }}>
                      {subtext}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 600,
                        padding: '3px 9px',
                        borderRadius: '9999px',
                        backgroundColor: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(140, 147, 167, 0.15)',
                        color: isActive ? '#34d399' : '#8c93a7',
                      }}
                    >
                      {isActive ? 'Active' : 'Draft'}
                    </span>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={(e) => {
                        e.stopPropagation()
                        selectTemplateForEdit(tmpl)
                      }}
                      style={{ fontSize: '12px', padding: '4px 10px', height: '28px' }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Right Column: Preview & Live Editor Card matching mockup 03_client_templates.png */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface-card, #12141a)',
              border: '1px solid var(--border-subtle, #1f232f)',
              borderRadius: 'var(--radius-lg, 16px)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                  Preview
                </h2>
                {selectedTemplate && (
                  <span style={{ fontSize: '12px', color: '#8c93a7' }}>
                    Editing: <strong style={{ color: '#ffffff' }}>{selectedTemplate.event_type} (v{selectedTemplate.version})</strong>
                  </span>
                )}
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
                Try a draft with sample data before it goes live.
              </p>
            </div>

            {feedback && (
              <div
                style={{
                  backgroundColor: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  border: `1px solid ${feedback.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  color: feedback.type === 'success' ? '#34d399' : '#f87171',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '13px',
                }}
              >
                {feedback.text}
              </div>
            )}

            {isCreatingNew && (
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                  Event Type
                </label>
                <input
                  type="text"
                  className="input-base"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  placeholder="e.g. otp, report_email, welcome_email"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                />
              </div>
            )}

            {/* Subject Input */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                Subject
              </label>
              <input
                type="text"
                className="input-base"
                style={{ width: '100%', boxSizing: 'border-box' }}
                placeholder="e.g. Your verification code is {{ otp_code }}"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            {/* Body Textarea */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                Body
              </label>
              <textarea
                className="input-base"
                style={{ width: '100%', boxSizing: 'border-box', minHeight: '120px', fontFamily: 'inherit', resize: 'vertical' }}
                placeholder="Write your email body here with {{ variable_name }}..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>

            {/* Sample Data JSON Textarea */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>
                  Sample Data (JSON variables)
                </label>
                {detectedVars.length > 0 && (
                  <span style={{ fontSize: '11px', color: '#8c93a7' }}>
                    Detected: {detectedVars.map((v) => `{{ ${v} }}`).join(', ')}
                  </span>
                )}
              </div>
              <textarea
                className="input-base"
                style={{ width: '100%', boxSizing: 'border-box', minHeight: '85px', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
                value={sampleDataStr}
                onChange={(e) => setSampleDataStr(e.target.value)}
              />
            </div>

            {/* Validation / Helper note matching mockup 03_client_templates.png */}
            <div
              style={{
                fontSize: '12.5px',
                color: previewError ? '#f87171' : 'var(--text-muted, #585f73)',
                padding: '8px 12px',
                backgroundColor: previewError ? 'rgba(239, 68, 68, 0.08)' : '#161922',
                borderRadius: '8px',
                border: `1px solid ${previewError ? 'rgba(239, 68, 68, 0.25)' : '#1f232f'}`,
              }}
            >
              {previewError ? (
                <span>⚠ {previewError}</span>
              ) : (
                <span>Missing a variable? We will tell you here, before any customer sees it.</span>
              )}
            </div>

            {/* Rendered Live Preview Card when toggled */}
            {showRenderedPreview && previewResult && (
              <div
                style={{
                  backgroundColor: '#0e1017',
                  border: '1px solid #2d3345',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ✓ Live Rendered Email Output
                </div>
                <div>
                  <span style={{ fontSize: '11.5px', color: '#8c93a7' }}>Subject: </span>
                  <strong style={{ fontSize: '13px', color: '#ffffff' }}>{previewResult.rendered_subject}</strong>
                </div>
                <div
                  style={{
                    backgroundColor: '#141722',
                    border: '1px solid #1f232f',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '12.5px',
                    color: '#e2e8f0',
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.5',
                  }}
                >
                  {previewResult.rendered_body}
                </div>
              </div>
            )}

            {/* Action Buttons matching mockup 03_client_templates.png */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={handlePreview}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Preview
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleSaveDraft}
                disabled={actionLoading}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Save draft
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleMakeActive}
                disabled={actionLoading}
                style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 600 }}
              >
                Make active
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
