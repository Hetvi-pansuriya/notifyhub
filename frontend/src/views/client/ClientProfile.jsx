import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
import { useAuth } from '../../auth'
import { formatDate } from '../../utils/date'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

export function ClientProfile() {
  const { user, client, logout } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [fromName, setFromName] = useState('')
  const [replyToEmail, setReplyToEmail] = useState('')
  const [senderEmail, setSenderEmail] = useState('notifications@notifyhub.local')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const loadIdentity = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await request('/console/client')
      if (data) {
        setFromName(data.from_name || data.name || '')
        setReplyToEmail(data.reply_to_email || '')
        if (data.sender_email) {
          setSenderEmail(data.sender_email)
        }
      }
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to load client profile')
      setLoading(false)
    }
  }, [])

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
          from_name: fromName.trim() || undefined,
          reply_to_email: replyToEmail.trim() || undefined,
        },
      })
      if (updated) {
        setFromName(updated.from_name || '')
        setReplyToEmail(updated.reply_to_email || '')
      }
      setFeedback({ type: 'success', message: 'Sending identity saved successfully!' })
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save sending identity' })
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

  const companyName = client?.name || user?.name || 'Company Tenant'
  const ownerEmail = user?.email || '—'
  const memberSince = user?.created_at ? formatDate(user.created_at) : '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Page Header */}
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
          Profile & Identity
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
          Organization details, email sender identity branding, and account settings
        </p>
      </div>

      {feedback && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            backgroundColor: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: feedback.type === 'success' ? '#34d399' : '#f87171',
            border: feedback.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
          }}
        >
          {feedback.message}
        </div>
      )}

      {/* Account Info Card */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface-card, #12141a)',
          border: '1px solid var(--border-subtle, #1f232f)',
          borderRadius: 'var(--radius-lg, 16px)',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
            Account Information
          </h2>
          <button
            type="button"
            className="btn-secondary"
            onClick={logout}
            style={{ fontSize: '12px' }}
          >
            Sign out
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', marginBottom: '4px' }}>
              Company Name
            </div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff' }}>
              {companyName}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', marginBottom: '4px' }}>
              Account Owner Email
            </div>
            <div style={{ fontSize: '15px', fontWeight: 500, color: '#ffffff' }}>
              {ownerEmail}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', marginBottom: '4px' }}>
              Member Since
            </div>
            <div style={{ fontSize: '15px', fontWeight: 500, color: '#ffffff' }}>
              {memberSince}
            </div>
          </div>
        </div>
      </div>

      {/* Sending Identity Card */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface-card, #12141a)',
          border: '1px solid var(--border-subtle, #1f232f)',
          borderRadius: 'var(--radius-lg, 16px)',
          padding: '24px',
        }}
      >
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
            Sending Identity
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
            Customize the display name and reply-to address shown to your email recipients.
          </p>
        </div>

        <form onSubmit={handleSaveIdentity} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, color: '#f1f3f9', marginBottom: '6px' }}>
                Sender Display Name (From Name)
              </label>
              <input
                type="text"
                placeholder="e.g. Acme Notifications"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
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
                Reply-To Email Address
              </label>
              <input
                type="email"
                placeholder="e.g. support@acme.com"
                value={replyToEmail}
                onChange={(e) => setReplyToEmail(e.target.value)}
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
          </div>

          {/* Live Preview Card */}
          <div
            style={{
              backgroundColor: '#161922',
              border: '1px solid #202431',
              borderRadius: '10px',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Live Recipient Header Preview
            </div>
            <div style={{ fontSize: '13px', color: '#ffffff', lineHeight: 1.6 }}>
              <div>
                <span style={{ color: 'var(--text-muted, #585f73)' }}>Emails sent from NotifyHub will appear as: </span>
                <strong>{fromName || companyName}</strong> &lt;{senderEmail}&gt;
              </div>
              <div>
                <span style={{ color: 'var(--text-muted, #585f73)' }}>Replies will go to: </span>
                <strong>{replyToEmail || 'sender default (no reply-to set)'}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving identity...' : 'Save sending identity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
