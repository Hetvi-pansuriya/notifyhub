import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
import { useAuth } from '../../auth'
import { formatDate } from '../../utils/date'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

export function ClientProfile() {
  const { user, client: authClient } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [companyName, setCompanyName] = useState('')
  const [fromName, setFromName] = useState('')
  const [replyToEmail, setReplyToEmail] = useState('')
  const [senderEmail, setSenderEmail] = useState('no-reply@notifyhub.local')
  const [rateLimit, setRateLimit] = useState(50)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const loadIdentity = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await request('/console/client')
      if (data) {
        setCompanyName(data.name || authClient?.name || '')
        setFromName(data.from_name || data.name || '')
        setReplyToEmail(data.reply_to_email || '')
        setRateLimit(data.rate_limit_per_sec || 50)
        if (data.sender_email) {
          setSenderEmail(data.sender_email)
        }
      }
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to load client profile')
      setLoading(false)
    }
  }, [authClient])

  useEffect(() => {
    loadIdentity()
  }, [loadIdentity])

  const handleSaveIdentity = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      const updated = await request('/console/client', {
        method: 'PATCH',
        body: {
          name: companyName.trim() || undefined,
          from_name: fromName.trim() || undefined,
          reply_to_email: replyToEmail.trim() || undefined,
        },
      })
      if (updated) {
        setCompanyName(updated.name || '')
        setFromName(updated.from_name || '')
        setReplyToEmail(updated.reply_to_email || '')
      }
      setFeedback({ type: 'success', message: 'Organization profile and sending identity saved successfully!' })
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save changes' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Skeleton variant="card" height="140px" />
        <Skeleton variant="card" height="260px" />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadIdentity} />
  }

  const ownerEmail = user?.email || '—'
  const memberSince = user?.created_at ? formatDate(user.created_at) : 'Active'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Page Header */}
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
          Profile & Organization
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
          Organization metadata, email sender branding, and subscription overview
        </p>
      </div>

      {feedback && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            backgroundColor: feedback.type === 'success' ? 'rgba(74, 222, 128, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            color: feedback.type === 'success' ? '#4ade80' : '#ef4444',
            border: `1px solid ${feedback.type === 'success' ? 'rgba(74, 222, 128, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
          }}
        >
          {feedback.message}
        </div>
      )}

      {/* Account & Organization Overview Card */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface-card, #12141a)',
          border: '1px solid var(--border-subtle, #1f232f)',
          borderRadius: 'var(--radius-lg, 16px)',
          padding: '24px',
        }}
      >
        <div style={{ marginBottom: '18px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
            Account & Tenant Overview
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
            Registered tenant credentials and system throughput entitlements
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          <div style={{ padding: '14px 16px', backgroundColor: '#161922', borderRadius: '10px', border: '1px solid #202431' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)' }}>Owner Email</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', marginTop: '4px' }}>{ownerEmail}</div>
          </div>
          <div style={{ padding: '14px 16px', backgroundColor: '#161922', borderRadius: '10px', border: '1px solid #202431' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)' }}>Account Role</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#4ade80', marginTop: '4px' }}>Organization Owner</div>
          </div>
          <div style={{ padding: '14px 16px', backgroundColor: '#161922', borderRadius: '10px', border: '1px solid #202431' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)' }}>Throughput Rate Limit</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', marginTop: '4px' }}>{rateLimit} requests / sec</div>
          </div>
          <div style={{ padding: '14px 16px', backgroundColor: '#161922', borderRadius: '10px', border: '1px solid #202431' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)' }}>Member Status</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', marginTop: '4px' }}>{memberSince}</div>
          </div>
        </div>
      </div>

      {/* Editable Organization & Sender Branding Form */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface-card, #12141a)',
          border: '1px solid var(--border-subtle, #1f232f)',
          borderRadius: 'var(--radius-lg, 16px)',
          padding: '24px',
        }}
      >
        <div style={{ marginBottom: '18px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
            Sender Identity & Branding
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
            Configure how your transactional emails appear in recipient inboxes
          </p>
        </div>

        <form onSubmit={handleSaveIdentity} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
            {/* Company Name */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#8c93a7', marginBottom: '6px' }}>
                Company / Organization Name
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Corp"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  backgroundColor: '#161922',
                  border: '1px solid var(--border-subtle, #1f232f)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>

            {/* From Name */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#8c93a7', marginBottom: '6px' }}>
                Sender Display Name (From Name)
              </label>
              <input
                type="text"
                required
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Acme Alerts"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  backgroundColor: '#161922',
                  border: '1px solid var(--border-subtle, #1f232f)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted, #585f73)', marginTop: '4px', display: 'block' }}>
                Appears as "{fromName || companyName || 'Client'} via NotifyHub"
              </span>
            </div>

            {/* Reply-To Email */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#8c93a7', marginBottom: '6px' }}>
                Reply-To Email Address
              </label>
              <input
                type="email"
                value={replyToEmail}
                onChange={(e) => setReplyToEmail(e.target.value)}
                placeholder="support@acme.example"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  backgroundColor: '#161922',
                  border: '1px solid var(--border-subtle, #1f232f)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted, #585f73)', marginTop: '4px', display: 'block' }}>
                Where customer replies will be directed
              </span>
            </div>
          </div>

          {/* Live Sender Preview Box */}
          <div
            style={{
              padding: '14px 18px',
              backgroundColor: '#161922',
              borderRadius: '10px',
              border: '1px solid #202431',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #585f73)' }}>
              Live Email Header Preview
            </div>
            <div style={{ fontSize: '13px', color: '#f1f3f9', fontFamily: 'monospace' }}>
              <strong>From:</strong> "{fromName || companyName || 'Client'} via NotifyHub" &lt;{senderEmail}&gt;
            </div>
            {replyToEmail && (
              <div style={{ fontSize: '13px', color: '#f1f3f9', fontFamily: 'monospace' }}>
                <strong>Reply-To:</strong> &lt;{replyToEmail}&gt;
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving Changes...' : 'Save Profile & Identity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
