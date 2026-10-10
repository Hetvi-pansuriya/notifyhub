import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

export function AdminSettings() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // Form Fields matching mockup 16_admin_settings.png
  const [requestsPerSec, setRequestsPerSec] = useState('50')
  const [sendingSpeed, setSendingSpeed] = useState('20')
  const [retryAfter, setRetryAfter] = useState('5s, 10s, 20s, 40s')
  const [host, setHost] = useState('smtp.example.com')
  const [port, setPort] = useState('587')
  const [fromAddress, setFromAddress] = useState('no-reply@notifyhub.example')
  const [maintenanceMode, setMaintenanceMode] = useState(false)

  // Rotate key state
  const [rotatedKey, setRotatedKey] = useState(null)
  const [rotatingKey, setRotatingKey] = useState(false)

  // Diagnostics state
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [testRecipient, setTestRecipient] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [probing, setProbing] = useState(false)
  const [probeResult, setProbeResult] = useState(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await request('/admin/settings')
      setSettings(data)
      setRequestsPerSec(String(data.requests_per_sec || data.default_rate_limit_per_sec || 50))
      setSendingSpeed(String(data.sending_speed || 20))
      setRetryAfter(data.retry_after || '5s, 10s, 20s, 40s')
      setHost(data.smtp_host || 'smtp.example.com')
      setPort(String(data.smtp_port || 587))
      setFromAddress(data.from_address || data.from_email || 'no-reply@notifyhub.example')
      setMaintenanceMode(Boolean(data.maintenance_mode))
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to load system settings')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSaveChanges = async (e) => {
    if (e) e.preventDefault()
    setSaving(true)
    setSaveSuccess(false)
    setSaveError(null)
    try {
      await request('/admin/settings', {
        method: 'PATCH',
        body: {
          requests_per_sec: Number(requestsPerSec) || 50,
          sending_speed: Number(sendingSpeed) || 20,
          retry_after: retryAfter,
          smtp_host: host,
          smtp_port: Number(port) || 587,
          from_address: fromAddress,
          maintenance_mode: maintenanceMode,
        },
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 4000)
    } catch (err) {
      setSaveError(err.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleRotateKey = async () => {
    if (!window.confirm('Are you sure you want to rotate the admin key? This will invalidate existing master API sessions.')) {
      return
    }
    setRotatingKey(true)
    try {
      const res = await request('/admin/settings/rotate-admin-key', { method: 'POST' })
      setRotatedKey(res.new_admin_key)
    } catch (err) {
      alert(`Key rotation failed: ${err.message}`)
    } finally {
      setRotatingKey(false)
    }
  }

  const handleTestConnection = async () => {
    setProbing(true)
    setProbeResult(null)
    try {
      const res = await request('/admin/settings/test-connection', { method: 'POST' })
      setProbeResult(res)
    } catch (err) {
      setProbeResult({ status: 'error', error: err.message || 'Connection probe failed' })
    } finally {
      setProbing(false)
    }
  }

  const handleSendTestEmail = async (e) => {
    e.preventDefault()
    if (!testRecipient.trim()) return
    setSendingTest(true)
    setTestResult(null)
    try {
      const res = await request('/admin/settings/test-email', {
        method: 'POST',
        body: {
          recipient: testRecipient.trim(),
          subject: 'NotifyHub Diagnostic Verification Email',
          body: 'Hello! This is a real diagnostic email dispatched from your NotifyHub Admin Console.',
        },
      })
      setTestResult({
        type: 'success',
        text: `Email successfully accepted by ${res.provider} in ${res.latency_ms}ms (ID: ${res.provider_message_id || 'ok'})`,
      })
    } catch (err) {
      setTestResult({ type: 'error', text: err.message || 'Failed to dispatch test email' })
    } finally {
      setSendingTest(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Skeleton variant="text" width="140px" height="28px" />
          <Skeleton variant="button" width="120px" height="36px" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <Skeleton variant="card" height="260px" />
          <Skeleton variant="card" height="260px" />
          <Skeleton variant="card" height="140px" />
          <Skeleton variant="card" height="140px" />
        </div>
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadSettings} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header matching mockup 16_admin_settings.png */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
            Settings
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary, #8c93a7)', margin: '6px 0 0 0' }}>
            Defaults and safety settings for the whole platform.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {saveSuccess && (
            <span style={{ fontSize: '13px', color: '#10b981', fontWeight: 500 }}>
              ✓ Settings saved
            </span>
          )}
          {saveError && (
            <span style={{ fontSize: '13px', color: '#ef4444', fontWeight: 500 }}>
              ✕ {saveError}
            </span>
          )}
          <button
            type="button"
            onClick={handleSaveChanges}
            disabled={saving}
            style={{
              backgroundColor: '#ffffff',
              color: '#0a0d14',
              border: 'none',
              borderRadius: '9999px',
              padding: '8px 22px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!saving) e.currentTarget.style.opacity = '0.9'
            }}
            onMouseLeave={(e) => {
              if (!saving) e.currentTarget.style.opacity = '1'
            }}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* 2x2 Grid Cards matching mockup 16_admin_settings.png */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
        {/* Card 1: Defaults for new clients */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface-card, #12141a)',
            border: '1px solid var(--border-subtle, #1f232f)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
            Defaults for new clients
          </h3>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary, #8c93a7)', marginBottom: '6px' }}>
              Requests per second
            </label>
            <input
              type="number"
              className="input-field"
              value={requestsPerSec}
              onChange={(e) => setRequestsPerSec(e.target.value)}
              placeholder="50"
              style={{ backgroundColor: '#0f0f11', color: 'var(--text-main, #ececec)', border: '1px solid var(--border-input, #232325)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary, #9a9a9f)', marginBottom: '6px' }}>
              Sending speed (emails per second)
            </label>
            <input
              type="number"
              className="input-field"
              value={sendingSpeed}
              onChange={(e) => setSendingSpeed(e.target.value)}
              placeholder="20"
              style={{ backgroundColor: '#0f0f11', color: 'var(--text-main, #ececec)', border: '1px solid var(--border-input, #232325)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary, #9a9a9f)', marginBottom: '6px' }}>
              Retry after
            </label>
            <input
              type="text"
              className="input-field"
              value={retryAfter}
              onChange={(e) => setRetryAfter(e.target.value)}
              placeholder="5s, 10s, 20s, 40s"
              style={{ backgroundColor: '#0f0f11', color: 'var(--text-main, #ececec)', border: '1px solid var(--border-input, #232325)' }}
            />
          </div>
        </div>

        {/* Card 2: Mail server */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface-card, #12141a)',
            border: '1px solid var(--border-subtle, #1f232f)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
            Mail server
          </h3>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary, #9a9a9f)', marginBottom: '6px' }}>
              Host
            </label>
            <input
              type="text"
              className="input-field"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="smtp.example.com"
              style={{ backgroundColor: '#0f0f11', color: 'var(--text-main, #ececec)', border: '1px solid var(--border-input, #232325)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary, #9a9a9f)', marginBottom: '6px' }}>
              Port
            </label>
            <input
              type="number"
              className="input-field"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="587"
              style={{ backgroundColor: '#0f0f11', color: 'var(--text-main, #ececec)', border: '1px solid var(--border-input, #232325)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary, #9a9a9f)', marginBottom: '6px' }}>
              From address
            </label>
            <input
              type="email"
              className="input-field"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="no-reply@notifyhub.example"
              style={{ backgroundColor: '#0f0f11', color: 'var(--text-main, #ececec)', border: '1px solid var(--border-input, #232325)' }}
            />
          </div>
        </div>

        {/* Card 3: Admin key */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface-card, #12141a)',
            border: '1px solid var(--border-subtle, #1f232f)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', margin: '0 0 6px 0' }}>
              Admin key
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary, #8c93a7)', margin: 0 }}>
              Rotating it signs out everyone using the old one.
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={handleRotateKey}
              disabled={rotatingKey}
              style={{
                backgroundColor: '#18181a',
                color: '#ffffff',
                border: '1px solid #232325',
                borderRadius: '8px',
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: rotatingKey ? 'not-allowed' : 'pointer',
              }}
            >
              {rotatingKey ? 'Rotating...' : 'Rotate admin key'}
            </button>
          </div>

          {rotatedKey && (
            <div
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#ffffff',
              }}
            >
              <div style={{ color: '#10b981', fontWeight: 600, marginBottom: '4px' }}>
                New Admin Key Generated:
              </div>
              <code style={{ wordBreak: 'break-all', fontFamily: 'monospace', color: '#a7f3d0' }}>
                {rotatedKey}
              </code>
            </div>
          )}
        </div>

        {/* Card 4: Maintenance mode */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface-card, #12141a)',
            border: '1px solid var(--border-subtle, #1f232f)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', margin: '0 0 6px 0' }}>
              Maintenance mode
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary, #8c93a7)', margin: 0 }}>
              Pause all new emails while you work.
            </p>
          </div>

          {/* Toggle Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={maintenanceMode}
            onClick={() => setMaintenanceMode(!maintenanceMode)}
            style={{
              position: 'relative',
              width: '46px',
              height: '26px',
              backgroundColor: maintenanceMode ? '#10b981' : '#27272a',
              borderRadius: '9999px',
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
              padding: 0,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: '3px',
                left: maintenanceMode ? '23px' : '3px',
                width: '20px',
                height: '20px',
                backgroundColor: '#ffffff',
                borderRadius: '50%',
                transition: 'left 0.2s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              }}
            />
          </button>
        </div>
      </div>

      {/* Diagnostics Toggle */}
      <div style={{ marginTop: '8px' }}>
        <button
          type="button"
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary, #8c93a7)',
            fontSize: '13px',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>{showDiagnostics ? '▼ Hide' : '▶ Show'} Connectivity & Diagnostic Tools</span>
        </button>

        {showDiagnostics && (
          <div
            style={{
              marginTop: '16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '16px',
            }}
          >
            {/* Test Connection */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-card, #12141a)',
                border: '1px solid var(--border-subtle, #1f232f)',
                borderRadius: '16px',
                padding: '20px',
              }}
            >
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', margin: '0 0 8px 0' }}>
                Test Connection
              </h4>
              <p style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', margin: '0 0 14px 0' }}>
                Probe network socket reachability to your SMTP or provider host.
              </p>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleTestConnection}
                disabled={probing}
                style={{ fontSize: '12px' }}
              >
                {probing ? 'Probing...' : 'Run connection probe'}
              </button>
              {probeResult && (
                <div style={{ marginTop: '12px', fontSize: '12px', color: probeResult.status === 'ok' ? '#10b981' : '#ef4444' }}>
                  {probeResult.status === 'ok'
                    ? `Connected to ${probeResult.provider} (${probeResult.latency_ms}ms)`
                    : `Probe failed: ${probeResult.error}`}
                </div>
              )}
            </div>

            {/* Send Test Email */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-card, #12141a)',
                border: '1px solid var(--border-subtle, #1f232f)',
                borderRadius: '16px',
                padding: '20px',
              }}
            >
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', margin: '0 0 8px 0' }}>
                Send Diagnostic Email
              </h4>
              <form onSubmit={handleSendTestEmail} style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <input
                  type="email"
                  className="input-field"
                  placeholder="admin@example.com"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  style={{ flex: 1, fontSize: '13px', backgroundColor: '#0f0f11', color: 'var(--text-main, #ececec)', border: '1px solid var(--border-input, #232325)' }}
                  required
                />
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={sendingTest}
                  style={{ fontSize: '12px' }}
                >
                  {sendingTest ? 'Sending...' : 'Send'}
                </button>
              </form>
              {testResult && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: testResult.type === 'success' ? '#10b981' : '#ef4444' }}>
                  {testResult.text}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
