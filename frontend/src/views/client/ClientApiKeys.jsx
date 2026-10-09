import React, { useState, useEffect } from 'react';
import { api, getClientKey, getClientInfo } from '../../api';

export function ClientApiKeys({ onOpenSendEventModal }) {
  const currentKey = getClientKey();
  const [clientInfo, setClientInfo] = useState(getClientInfo());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadClient() {
      const res = await api.getMe();
      if (res.ok && res.data) {
        setClientInfo(res.data);
      }
    }
    loadClient();
  }, []);

  const displayMasked = (key) => {
    if (!key) return 'nh_live_••••••••••••••••••••••••';
    const prefix = key.slice(0, 14);
    return `${prefix}••••••••••••••••••••••••`;
  };

  const handleCopySnippet = () => {
    const snippet = `curl -X POST http://localhost:8000/api/events \\
  -H "X-API-Key: ${currentKey}" \\
  -H "Idempotency-Key: order-1001-shipped" \\
  -d '{"event_type":"order_shipped","email":"customer@example.com","data":{"order_id":1001,"customer":"Alice","tracking":"TRK-1001"}}'`;

    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="client-api-keys">
      <div className="page-header">
        <div className="page-header-text">
          <h1>API keys</h1>
          <p>Use this key to send events from your application.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.1fr', gap: '20px', marginBottom: '24px' }}>
        {/* Live Key Card */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header" style={{ marginBottom: '14px' }}>
            <div className="card-title">Live key ({clientInfo?.name || 'Client Tenant'})</div>
            <span className={`badge ${clientInfo?.status === 'active' ? 'badge-green' : 'badge-orange'}`} style={{ textTransform: 'capitalize' }}>
              {clientInfo?.status || 'Active'}
            </span>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                background: '#161822',
                border: '1px solid #232734',
                borderRadius: '10px',
                padding: '12px 16px',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{displayMasked(currentKey)}</span>
              <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>AUTHENTICATED</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
            <div style={{ fontSize: '12px', color: '#687084' }}>
              Key prefix: <code>{clientInfo?.api_key_prefix || 'nh_live_...'}</code> · Rate limit: {clientInfo?.rate_limit_per_sec || 50} req/s
            </div>
          </div>

          <div className="info-banner">
            <span>For safety, raw API keys are cryptographically hashed using SHA-256 upon generation.</span>
          </div>
        </div>

        {/* Rotating a key card */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div className="card-title">Rotating a key</div>
          </div>
          <p style={{ fontSize: '13.5px', color: '#8c93a7', lineHeight: 1.6 }}>
            The old key stops working straight away. To rotate your key, contact your platform administrator in the Admin Console.
          </p>
        </div>
      </div>

      {/* Send your first event card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Send your first event</div>
            <div className="card-subtitle">Copy this into a terminal or dispatch directly using the live test modal.</div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-secondary" onClick={handleCopySnippet}>
              {copied ? '✓ Copied!' : 'Copy snippet'}
            </button>
            <button className="btn-primary" onClick={onOpenSendEventModal}>
              Test dispatch here
            </button>
          </div>
        </div>

        <div className="code-snippet-box">
          <pre>{`curl -X POST http://localhost:8000/api/events \\
  -H "X-API-Key: ${currentKey}" \\
  -H "Idempotency-Key: order-1001-shipped" \\
  -d '{"event_type":"order_shipped","email":"customer@example.com","data":{"order_id":1001,"customer":"Alice","tracking":"TRK-1001"}}'`}</pre>
        </div>
      </div>
    </div>
  );
}
