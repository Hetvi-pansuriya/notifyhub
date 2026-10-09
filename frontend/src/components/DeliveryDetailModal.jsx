import React, { useState } from 'react';
import { api } from '../api';

export function DeliveryDetailModal({ delivery, onClose, onRetried }) {
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState(null);

  if (!delivery) return null;

  const handleRetry = async () => {
    setRetrying(true);
    setRetryResult(null);
    const res = await api.retryDelivery(delivery.id);
    setRetrying(false);
    setRetryResult(res);
    if (res.ok && onRetried) {
      onRetried(delivery.id);
    }
  };

  const getStatusBadge = (status) => {
    switch (status?.toLowerCase()) {
      case 'sent': return 'badge-green';
      case 'queued': return 'badge-orange';
      case 'dead':
      case 'failed': return 'badge-red';
      default: return 'badge-gray';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Delivery Details</div>
            <div style={{ fontSize: '12px', color: '#8c93a7', marginTop: '2px' }}>ID: {delivery.id}</div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {/* Header summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', background: '#161922', padding: '16px', borderRadius: '12px', border: '1px solid #202431' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#585f73' }}>Status</div>
              <div style={{ marginTop: '4px' }}>
                <span
                  className={`badge ${getStatusBadge(delivery.status)}`}
                  title={delivery.status?.toLowerCase() === 'sent' ? 'Sent means our mail provider accepted it. It can still take a moment to reach the inbox.' : undefined}
                  style={delivery.status?.toLowerCase() === 'sent' ? { cursor: 'help' } : {}}
                >
                  {delivery.status}
                </span>
                {delivery.status?.toLowerCase() === 'sent' && (
                  <div style={{ fontSize: '11px', color: '#8c93a7', marginTop: '4px', lineHeight: 1.3 }}>
                    Sent means our mail provider accepted it. It can still take a moment to reach the inbox.
                  </div>
                )}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#585f73' }}>Priority</div>
              <div style={{ fontWeight: 600, marginTop: '4px', color: delivery.priority === 2 ? '#f59e0b' : '#fff' }}>
                {delivery.priority === 2 ? 'High (2)' : 'Normal (1)'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#585f73' }}>Attempts</div>
              <div style={{ fontWeight: 600, marginTop: '4px' }}>
                {delivery.attempt_count || 0} / {(delivery.retry_schedule?.length || 0) + 1}
              </div>
            </div>
          </div>

          {/* Recipient & Subject */}
          <div className="form-group">
            <label className="form-label">Recipient</label>
            <input className="form-input" readOnly value={delivery.to_email || ''} />
          </div>

          <div className="form-group">
            <label className="form-label">Rendered Subject</label>
            <input className="form-input" readOnly value={delivery.rendered_subject || 'N/A'} />
          </div>

          <div className="form-group">
            <label className="form-label">Rendered Body</label>
            <textarea className="form-textarea" readOnly rows={3} value={delivery.rendered_body || 'N/A'} />
          </div>

          {delivery.sensitive && (
            <div className="info-banner" style={{ borderLeft: '3px solid #f59e0b' }}>
              <span>🔒 This is a sensitive delivery. Subject, body, and payload are redacted in storage for privacy.</span>
            </div>
          )}

          {delivery.last_error && (
            <div className="info-banner" style={{ borderLeft: '3px solid #ef4444', color: '#f87171' }}>
              <span>Last Error: {delivery.last_error}</span>
            </div>
          )}

          {/* Attempt history */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#fff' }}>
              Attempt History ({delivery.attempts?.length || 0})
            </div>
            {delivery.attempts && delivery.attempts.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {delivery.attempts.map((att) => (
                  <div
                    key={att.attempt_no}
                    style={{
                      background: '#151720',
                      border: '1px solid #1f232f',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12.5px',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: '#fff' }}>Attempt #{att.attempt_no}</span>
                      <span style={{ color: '#585f73', marginLeft: '10px' }}>
                        {att.created_at ? new Date(att.created_at).toLocaleTimeString() : ''}
                      </span>
                      {att.latency_ms !== null && att.latency_ms !== undefined && (
                        <span style={{ color: '#585f73', marginLeft: '8px' }}>({att.latency_ms}ms)</span>
                      )}
                    </div>
                    <div>
                      <span className={`badge ${att.outcome === 'success' ? 'badge-green' : 'badge-red'}`}>
                        {att.outcome}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: '#585f73' }}>No attempts recorded yet.</div>
            )}
          </div>

          {retryResult && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                backgroundColor: retryResult.ok ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${retryResult.ok ? '#10b981' : '#ef4444'}`,
                color: retryResult.ok ? '#34d399' : '#f87171',
              }}
            >
              {retryResult.ok ? 'Delivery reset to queued! Worker will pick it up.' : retryResult.error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          {delivery.status === 'dead' && !delivery.sensitive && (
            <button className="btn-primary" onClick={handleRetry} disabled={retrying}>
              {retrying ? 'Retrying...' : 'Retry from DLQ'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
