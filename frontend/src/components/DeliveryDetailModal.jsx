import React, { useState } from 'react'
import { request, ApiError } from '../api'
import { formatDateTime } from '../utils/date'

export function DeliveryDetailModal({ delivery, onClose, onRetried }) {
  const [retrying, setRetrying] = useState(false)
  const [retryResult, setRetryResult] = useState(null)
  const [showRawPayload, setShowRawPayload] = useState(false)

  if (!delivery) return null

  const handleRetry = async () => {
    setRetrying(true)
    setRetryResult(null)
    try {
      await request(`/api/deliveries/${delivery.id}/retry`, { method: 'POST' })
      setRetryResult({ ok: true, message: 'Delivery re-queued successfully!' })
      if (onRetried) onRetried(delivery.id)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setRetryResult({ ok: false, message: 'Delivery is already queued or cannot be retried.' })
      } else {
        setRetryResult({ ok: false, message: err.message || 'Retry failed' })
      }
    } finally {
      setRetrying(false)
    }
  }

  const getStatusBadge = (status) => {
    switch (status?.toLowerCase()) {
      case 'sent':
        return 'badge-green'
      case 'queued':
        return 'badge-orange'
      case 'dead':
      case 'failed':
        return 'badge-red'
      default:
        return 'badge-gray'
    }
  }

  return (
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
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#12141a',
          border: '1px solid #1f232f',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '680px',
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
              Delivery Details
            </h2>
            <div style={{ fontSize: '11px', color: '#585f73', marginTop: '2px', fontFamily: 'monospace' }}>
              {delivery.id}
            </div>
          </div>
          <button
            onClick={onClose}
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
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top meta grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              background: '#161922',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid #202431',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: '#585f73' }}>Status</div>
              <div style={{ marginTop: '4px' }}>
                <span className={`badge ${getStatusBadge(delivery.status)}`}>
                  {delivery.status}
                </span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#585f73' }}>Attempts</div>
              <div style={{ fontWeight: 600, marginTop: '4px', color: '#ffffff' }}>
                {delivery.attempt_count ?? 0}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#585f73' }}>Priority</div>
              <div style={{ fontWeight: 600, marginTop: '4px', color: '#ffffff' }}>
                {delivery.priority ?? 1}
              </div>
            </div>
          </div>

          {/* Key details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#585f73', marginBottom: '4px' }}>Client ID</div>
              <div style={{ fontSize: '13px', color: '#f1f3f9', fontFamily: 'monospace' }}>
                {delivery.client_id || '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#585f73', marginBottom: '4px' }}>Event Type</div>
              <div style={{ fontSize: '13px', color: '#f1f3f9', fontWeight: 500 }}>
                {delivery.event_type || 'default'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#585f73', marginBottom: '4px' }}>Recipient Email</div>
              <div style={{ fontSize: '13px', color: '#f1f3f9', fontWeight: 500 }}>
                {delivery.recipient_email || delivery.to_email || '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#585f73', marginBottom: '4px' }}>Created At</div>
              <div style={{ fontSize: '13px', color: '#f1f3f9' }}>
                {formatDateTime(delivery.created_at)}
              </div>
            </div>
            {delivery.sent_at && (
              <div>
                <div style={{ fontSize: '12px', color: '#585f73', marginBottom: '4px' }}>Sent At</div>
                <div style={{ fontSize: '13px', color: '#34d399' }}>
                  {formatDateTime(delivery.sent_at)}
                </div>
              </div>
            )}
            {delivery.next_attempt_at && delivery.status === 'queued' && (
              <div>
                <div style={{ fontSize: '12px', color: '#585f73', marginBottom: '4px' }}>Next Attempt At</div>
                <div style={{ fontSize: '13px', color: '#fbbf24' }}>
                  {formatDateTime(delivery.next_attempt_at)}
                </div>
              </div>
            )}
            {delivery.idempotency_key && (
              <div style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: '12px', color: '#585f73', marginBottom: '4px' }}>Idempotency Key</div>
                <div style={{ fontSize: '12px', color: '#8c93a7', fontFamily: 'monospace' }}>
                  {delivery.idempotency_key}
                </div>
              </div>
            )}
          </div>

          {/* Subject & Body */}
          <div>
            <div style={{ fontSize: '12px', color: '#585f73', marginBottom: '4px' }}>Rendered Subject</div>
            <div
              style={{
                backgroundColor: '#161922',
                border: '1px solid #202431',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '13px',
                color: '#ffffff',
              }}
            >
              {delivery.rendered_subject || 'N/A'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '12px', color: '#585f73', marginBottom: '4px' }}>Rendered Body</div>
            <pre
              style={{
                backgroundColor: '#161922',
                border: '1px solid #202431',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '12px',
                color: '#8c93a7',
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                maxHeight: '140px',
                overflowY: 'auto',
                margin: 0,
              }}
            >
              {delivery.rendered_body || 'N/A'}
            </pre>
          </div>

          {/* Attachments */}
          {delivery.attachments && delivery.attachments.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', color: '#585f73', marginBottom: '4px' }}>Attachments</div>
              <div
                style={{
                  backgroundColor: '#161922',
                  border: '1px solid #202431',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {delivery.attachments.map((att, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '13px',
                      color: '#f1f3f9',
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{att.filename}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                      <span style={{ color: '#8c93a7' }}>{(att.size_bytes / 1024).toFixed(1)} KB</span>
                      {!att.available && (
                        <span style={{ color: '#f59e0b', fontSize: '11px' }}>
                          Removed after sending
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Message if present */}
          {delivery.last_error && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '12px',
                color: '#f87171',
                fontSize: '12px',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '2px' }}>Last Error:</div>
              <div>{delivery.last_error}</div>
            </div>
          )}

          {/* Raw Payload Toggle */}
          <div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowRawPayload(!showRawPayload)}
              style={{ fontSize: '12px', padding: '4px 12px' }}
            >
              {showRawPayload ? 'Hide raw delivery JSON' : 'View raw delivery JSON'}
            </button>
            {showRawPayload && (
              <pre
                style={{
                  marginTop: '8px',
                  backgroundColor: '#0c0d12',
                  border: '1px solid #1f232f',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '11px',
                  color: '#8c93a7',
                  maxHeight: '160px',
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                }}
              >
                {JSON.stringify(delivery, null, 2)}
              </pre>
            )}
          </div>

          {retryResult && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                backgroundColor: retryResult.ok ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: retryResult.ok ? '#34d399' : '#f87171',
                border: `1px solid ${retryResult.ok ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              }}
            >
              {retryResult.message}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #1f232f',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          {delivery.status === 'dead' && !delivery.sensitive && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleRetry}
              disabled={retrying}
            >
              {retrying ? 'Retrying...' : 'Send again'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
