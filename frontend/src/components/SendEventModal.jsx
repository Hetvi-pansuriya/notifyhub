import React, { useState } from 'react';
import { api } from '../api';

export function SendEventModal({ isOpen, onClose, onEventSent }) {
  const [eventType, setEventType] = useState('order_shipped');
  const [email, setEmail] = useState('customer@example.com');
  const [idempotencyKey, setIdempotencyKey] = useState(`order_${Math.floor(1000 + Math.random() * 9000)}`);
  const [payloadText, setPayloadText] = useState(JSON.stringify({
    order_id: 1001,
    customer: 'Alice',
    tracking: 'TRK-USPS-1001'
  }, null, 2));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  if (!isOpen) return null;

  const handleTypeChange = (type) => {
    setEventType(type);
    if (type === 'login_otp') {
      setEmail('security@example.com');
      setIdempotencyKey(`otp_${Math.random().toString(36).substring(2, 9)}`);
      setPayloadText(JSON.stringify({ code: '778899' }, null, 2));
    } else {
      setEmail('customer@example.com');
      setIdempotencyKey(`order_${Math.floor(1000 + Math.random() * 9000)}`);
      setPayloadText(JSON.stringify({
        order_id: Math.floor(1000 + Math.random() * 9000),
        customer: 'Alice',
        tracking: 'TRK-USPS-999'
      }, null, 2));
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    let parsedData = {};
    try {
      parsedData = JSON.parse(payloadText);
    } catch (err) {
      setResult({ ok: false, error: 'Invalid JSON payload format' });
      setLoading(false);
      return;
    }

    const res = await api.sendEvent({
      event_type: eventType,
      email: email.trim(),
      data: parsedData,
    }, idempotencyKey.trim());

    setLoading(false);
    setResult(res);
    if (res.ok && onEventSent) {
      onEventSent(res.data);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Send Notification Event</div>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSend}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Event Type</label>
              <select
                className="form-input"
                value={eventType}
                onChange={(e) => handleTypeChange(e.target.value)}
              >
                <option value="order_shipped">order_shipped (Normal priority)</option>
                <option value="login_otp">login_otp (High priority, Sensitive, 300s TTL)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Recipient Email</label>
              <input
                type="email"
                className="form-input"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Idempotency Key</label>
              <input
                type="text"
                className="form-input"
                required
                value={idempotencyKey}
                onChange={(e) => setIdempotencyKey(e.target.value)}
              />
              <span style={{ fontSize: '11px', color: '#585f73' }}>
                Resending with the same key returns 200 replay without duplicate delivery.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Payload Data (JSON)</label>
              <textarea
                className="form-textarea form-textarea-code"
                rows={4}
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
              />
            </div>

            {result && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  backgroundColor: result.ok ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${result.ok ? '#10b981' : '#ef4444'}`,
                  color: result.ok ? '#34d399' : '#f87171',
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {result.ok ? `Status: ${result.status} ${result.status === 202 ? 'Accepted (Queued)' : 'OK (Replayed)'}` : `Error: ${result.status}`}
                </div>
                {result.ok ? (
                  <div style={{ marginTop: '4px', fontSize: '11.5px', color: '#e2e8f0' }}>
                    Delivery ID: <code>{result.data?.delivery?.id}</code>
                  </div>
                ) : (
                  <div>{result.error}</div>
                )}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Dispatching...' : 'Dispatch Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
