import React, { useState, useEffect } from 'react'
import { PageShell } from '../../components/PageShell'
import { request, ApiError } from '../../api'
import { useToast } from '../../components/Toast'

function formatDate(isoStr) {
  if (!isoStr) return '—'
  const date = new Date(isoStr)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatLastUsed(isoStr) {
  if (!isoStr) return 'Never used'
  const diffMs = Date.now() - new Date(isoStr).getTime()
  if (diffMs < 0) return 'Just now'
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`
}

export function ApiKeys() {
  const { addToast } = useToast()
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createStep, setCreateStep] = useState(1) // 1: Name input, 2: Key revealed
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState(null)
  const [hasSavedKey, setHasSavedKey] = useState(false)
  const [creating, setCreating] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)

  // Revoke Modal State
  const [keyToRevoke, setKeyToRevoke] = useState(null)
  const [revoking, setRevoking] = useState(false)

  // Code snippet copy states
  const [copiedCurl, setCopiedCurl] = useState(false)
  const [copiedNode, setCopiedNode] = useState(false)

  const activeKeysCount = keys.filter((k) => k.status === 'active').length
  const limitReached = activeKeysCount >= 5

  const loadKeys = async () => {
    try {
      setError('')
      const data = await request('/console/api-keys')
      setKeys(data)
    } catch (err) {
      setError(err.message || 'Failed to load API keys')
      addToast(err.message || 'Failed to load API keys', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadKeys()
  }, [])

  const handleOpenCreate = () => {
    setCreateStep(1)
    setNewKeyName('Production')
    setCreatedKey(null)
    setHasSavedKey(false)
    setCopiedKey(false)
    setIsCreateOpen(true)
  }

  const handleCloseCreate = () => {
    setIsCreateOpen(false)
    setCreatedKey(null) // Security: clear secret key from component state
    setNewKeyName('')
    setHasSavedKey(false)
    setCopiedKey(false)
    setCreateStep(1)
  }

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    if (!newKeyName.trim() || creating) return

    setCreating(true)
    try {
      const data = await request('/console/api-keys', {
        method: 'POST',
        body: { name: newKeyName.trim() },
      })
      setCreatedKey(data)
      setCreateStep(2)
      addToast(`API key "${data.name}" created`, 'success')
      await loadKeys()
    } catch (err) {
      addToast(err.message || 'Failed to create API key', 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleCopyNewKey = async () => {
    if (!createdKey?.api_key) return
    try {
      await navigator.clipboard.writeText(createdKey.api_key)
      setCopiedKey(true)
      addToast('API key copied to clipboard', 'success')
      setTimeout(() => setCopiedKey(false), 2500)
    } catch {
      addToast('Could not access clipboard', 'error')
    }
  }

  const handleOpenRevoke = (key) => {
    setKeyToRevoke(key)
  }

  const handleConfirmRevoke = async () => {
    if (!keyToRevoke || revoking) return

    setRevoking(true)
    try {
      await request(`/console/api-keys/${keyToRevoke.id}/revoke`, {
        method: 'POST',
      })
      addToast(`Key "${keyToRevoke.name}" revoked`, 'success')
      setKeyToRevoke(null)
      await loadKeys()
    } catch (err) {
      addToast(err.message || 'Failed to revoke key', 'error')
    } finally {
      setRevoking(false)
    }
  }

  const curlExample = `curl -X POST http://localhost:8000/api/events \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: $NOTIFYHUB_API_KEY" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "event_type": "order_shipped",
    "email": "customer@example.com",
    "data": { "order_id": "1234", "customer": "Alice", "tracking": "TRK-987" }
  }'`

  const nodeExample = `const response = await fetch('http://localhost:8000/api/events', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.NOTIFYHUB_API_KEY,
    'Idempotency-Key': crypto.randomUUID(),
  },
  body: JSON.stringify({
    event_type: 'order_shipped',
    email: 'customer@example.com',
    data: { order_id: '1234', customer: 'Alice', tracking: 'TRK-987' },
  }),
});`

  const handleCopyCode = async (text, setter) => {
    try {
      await navigator.clipboard.writeText(text)
      setter(true)
      addToast('Snippet copied to clipboard', 'success')
      setTimeout(() => setter(false), 2000)
    } catch {
      addToast('Could not access clipboard', 'error')
    }
  }

  return (
    <PageShell
      title="API keys"
      subtitle="Use a key to send events from your own server."
      action={
        <button
          className="btn btn-primary"
          onClick={handleOpenCreate}
          disabled={limitReached}
          title={limitReached ? 'Limit of 5 active keys reached' : 'Create a new key'}
        >
          Create key
        </button>
      }
    >
      {/* 5-key limit notice */}
      {limitReached && (
        <div
          style={{
            padding: '12px 18px',
            marginBottom: '20px',
            backgroundColor: 'var(--color-amber-bg)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: 'var(--radius-inner)',
            color: 'var(--color-amber)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span>⚠</span>
          <span>You have reached the limit of 5 active keys. Revoke one to create another.</span>
        </div>
      )}

      {/* Main Keys Card */}
      <div className="card" style={{ padding: 0, marginBottom: '32px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)' }}>
            Loading API keys...
          </div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-red)' }}>
            {error}
          </div>
        ) : keys.length === 0 ? (
          <div
            style={{
              padding: '56px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '14px',
            }}
          >
            <div style={{ fontSize: '15px', color: '#ffffff', fontWeight: 500 }}>
              You have no keys yet. Create one to start sending emails.
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleOpenCreate}>
              Create your first key
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const isRevoked = k.status === 'revoked'
                  return (
                    <tr
                      key={k.id}
                      style={{
                        opacity: isRevoked ? 0.45 : 1,
                        transition: 'opacity 0.15s ease',
                      }}
                    >
                      <td style={{ fontWeight: 500, color: isRevoked ? 'var(--color-muted)' : '#ffffff' }}>
                        {k.name}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', letterSpacing: '0.02em' }}>
                        <span>{k.key_prefix || k.prefix}</span>
                        <span style={{ color: 'var(--color-muted)', letterSpacing: '0.15em' }}>••••••••••••••••••••••••••••••••</span>
                      </td>
                      <td>
                        <span className={`status-pill ${isRevoked ? 'status-grey' : 'status-green'}`}>
                          {isRevoked ? 'Revoked' : 'Active'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--color-muted)', fontSize: '13px' }}>
                        {formatDate(k.created_at)}
                      </td>
                      <td style={{ color: 'var(--color-muted)', fontSize: '13px' }}>
                        {formatLastUsed(k.last_used_at)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {!isRevoked && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleOpenRevoke(k)}
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* "Where do I use this key?" Explainer Card */}
      <div className="card" style={{ padding: '28px' }}>
        <h2 style={{ fontSize: '17px', marginBottom: '14px' }}>
          Where do I use this key?
        </h2>

        {/* Numbered Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', fontSize: '14px' }}>
            <span style={{ fontWeight: 600, color: '#ffffff', minWidth: '16px' }}>1.</span>
            <span>Create a key here.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', fontSize: '14px' }}>
            <span style={{ fontWeight: 600, color: '#ffffff', minWidth: '16px' }}>2.</span>
            <span>
              Save it on your server as an environment variable (
              <code style={{ fontFamily: 'var(--font-mono)', color: '#ffffff' }}>NOTIFYHUB_API_KEY</code>
              ).
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', fontSize: '14px' }}>
            <span style={{ fontWeight: 600, color: '#ffffff', minWidth: '16px' }}>3.</span>
            <span>
              Send it in the <code style={{ fontFamily: 'var(--font-mono)', color: '#ffffff' }}>X-API-Key</code> header when your server calls NotifyHub.
            </span>
          </div>
        </div>

        {/* Warning Line */}
        <div
          style={{
            padding: '10px 14px',
            marginBottom: '24px',
            backgroundColor: 'rgba(251, 191, 36, 0.08)',
            borderLeft: '3px solid var(--color-amber)',
            borderRadius: '4px',
            fontSize: '13px',
            color: 'var(--color-amber)',
          }}
        >
          Use it on your server only. Never put it in website or mobile app code.
        </div>

        {/* Example Snippets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Curl Example */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#ffffff' }}>
                cURL Example
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleCopyCode(curlExample, setCopiedCurl)}
              >
                {copiedCurl ? '✓ Copied' : 'Copy cURL'}
              </button>
            </div>
            <pre className="code-box" style={{ overflowX: 'auto', whiteSpace: 'pre', lineHeight: 1.45 }}>
              {curlExample}
            </pre>
          </div>

          {/* Node.js Fetch Example */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#ffffff' }}>
                Node.js fetch Example
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleCopyCode(nodeExample, setCopiedNode)}
              >
                {copiedNode ? '✓ Copied' : 'Copy Node.js'}
              </button>
            </div>
            <pre className="code-box" style={{ overflowX: 'auto', whiteSpace: 'pre', lineHeight: 1.45 }}>
              {nodeExample}
            </pre>
          </div>
        </div>
      </div>

      {/* CREATE KEY MODAL */}
      {isCreateOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            {createStep === 1 ? (
              <form onSubmit={handleCreateSubmit}>
                <h2 style={{ marginBottom: '8px' }}>Create API key</h2>
                <p style={{ fontSize: '13px', marginBottom: '20px' }}>
                  Give your key a descriptive name to identify the server or service using it.
                </p>

                <div className="form-group" style={{ marginBottom: '24px' }}>
                  <label className="form-label" htmlFor="keyName">Key name</label>
                  <input
                    id="keyName"
                    type="text"
                    className="form-input"
                    placeholder="Production"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    required
                    autoFocus
                    maxLength={50}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCloseCreate}
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={creating || !newKeyName.trim()}
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <h2 style={{ marginBottom: '8px' }}>Save your API key</h2>
                <p style={{ fontSize: '13px', marginBottom: '16px', color: 'var(--color-amber)' }}>
                  Copy it now. For safety we only show it once.
                </p>

                <div style={{ position: 'relative', marginBottom: '20px' }}>
                  <div
                    className="code-box"
                    style={{
                      fontSize: '13px',
                      padding: '14px 16px',
                      wordBreak: 'break-all',
                      border: '1px solid #38383e',
                    }}
                  >
                    {createdKey?.api_key}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleCopyNewKey}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '10px',
                    }}
                  >
                    {copiedKey ? '✓ Copied' : 'Copy'}
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '24px',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    id="savedConfirm"
                    checked={hasSavedKey}
                    onChange={(e) => setHasSavedKey(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#ffffff' }}
                  />
                  <label
                    htmlFor="savedConfirm"
                    style={{ fontSize: '13px', cursor: 'pointer', color: '#ffffff' }}
                  >
                    I have saved my key
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleCloseCreate}
                    disabled={!hasSavedKey}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REVOKE KEY CONFIRM MODAL */}
      {keyToRevoke && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h2 style={{ marginBottom: '8px', color: '#ffffff' }}>Revoke API key</h2>
            <p style={{ fontSize: '14px', marginBottom: '24px', lineHeight: 1.5 }}>
              Revoke key <strong>{keyToRevoke.name}</strong>? Apps using it will stop working straight away.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setKeyToRevoke(null)}
                disabled={revoking}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmRevoke}
                disabled={revoking}
                style={{
                  backgroundColor: 'var(--color-red)',
                  color: '#ffffff',
                  borderColor: 'var(--color-red)',
                }}
              >
                {revoking ? 'Revoking...' : 'Revoke key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
