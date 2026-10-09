import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

export function AdminSettings() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Test email state
  const [testRecipient, setTestRecipient] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [testResult, setTestResult] = useState(null)

  // Connection probe state
  const [probing, setProbing] = useState(false)
  const [probeResult, setProbeResult] = useState(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await request('/admin/settings')
      setSettings(data)
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to load system settings')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

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
          body: 'Hello! This is a real diagnostic email dispatched directly from your NotifyHub Admin Console.',
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
        <Skeleton variant="card" height="180px" />
        <Skeleton variant="card" height="260px" />
      </div>
    )
  }

  if (error || !settings) {
    return <ErrorState message={error || 'Settings unavailable'} onRetry={loadSettings} />
  }

  const CONFIG_GROUPS = [
    {
      title: 'Mail Delivery & Provider Configuration',
      description: 'Controls which outbound transport is used to dispatch email messages.',
      items: [
        {
          key: 'MAIL_PROVIDER',
          label: 'Outbound Mail Provider',
          value: settings.mail_provider || 'mailhog',
          badge: settings.mail_provider === 'sendgrid' ? 'Production (SendGrid)' : 'Development (MailHog)',
          badgeType: settings.mail_provider === 'sendgrid' ? 'blue' : 'gray',
          env: 'MAIL_PROVIDER=sendgrid | mailhog',
          note: 'Configured in backend/.env. MailHog is the default local inbox for dev.',
        },
        {
          key: 'SENDGRID_API_KEY',
          label: 'SendGrid Secret Key',
          value: settings.sendgrid_api_key_configured ? 'Set and Active' : 'Not Set (Using MailHog)',
          badge: settings.sendgrid_api_key_configured ? 'Configured' : 'Missing',
          badgeType: settings.sendgrid_api_key_configured ? 'green' : 'orange',
          env: 'SENDGRID_API_KEY=SG....',
          note: 'Raw key is never exposed in responses or logs. Only present in server environment.',
        },
        {
          key: 'FROM_EMAIL',
          label: 'System Default Sender Address',
          value: settings.from_email || 'no-reply@notifyhub.local',
          env: 'FROM_EMAIL=...',
          note: 'Fallback envelope address if a client has not configured a custom identity.',
        },
      ],
    },
    {
      title: 'Safety Limits & Rate Limiting Engine',
      description: 'Global system constraints that prevent spamming, abuse, and accidental runaway queues.',
      items: [
        {
          key: 'GLOBAL_DAILY_LIMIT',
          label: 'Global Safety Daily Ceiling',
          value: `${(settings.global_daily_limit || 90).toLocaleString()} emails/day`,
          env: 'GLOBAL_DAILY_LIMIT=90',
          note: 'Maximum emails the platform can send across all tenants within a calendar day.',
        },
        {
          key: 'DEFAULT_RATE_LIMIT_PER_SEC',
          label: 'Default Rate Limit Throttle',
          value: `${settings.default_rate_limit_per_sec || 50} requests / sec`,
          env: 'DEFAULT_RATE_LIMIT_PER_SEC=...',
          note: 'Initial token bucket refill rate for tenants without custom overrides.',
        },
        {
          key: 'DEFAULT_PLAN',
          label: 'Default Assigned Plan Tier',
          value: `${settings.default_plan_name || 'Starter'} (${(settings.default_plan_monthly_limit || 10000).toLocaleString()}/mo)`,
          env: 'DEFAULT_PLAN_NAME=Starter',
          note: 'Automatically granted to new signups upon self-service registration.',
        },
      ],
    },
    {
      title: 'Worker Daemon & Operational Parameters',
      description: 'Concurrency, lease timeout intervals, and session security.',
      items: [
        {
          key: 'WORKER_CONCURRENCY',
          label: 'Worker Thread Concurrency',
          value: `${settings.worker_concurrency || 2} workers`,
          env: 'WORKER_CONCURRENCY=...',
          note: 'Concurrent delivery sender loops processing queue items.',
        },
        {
          key: 'LOCK_SECONDS & REAPER_SECONDS',
          label: 'Lock Lease & Reaper Interval',
          value: `${settings.lock_seconds || 60}s lock timeout · ${settings.reaper_seconds || 30}s sweep`,
          env: 'LOCK_SECONDS=60 / REAPER_SECONDS=30',
          note: 'Reaper re-enqueues orphaned processing jobs that exceeded lock lease duration.',
        },
        {
          key: 'MAX_ACTIVE_KEYS',
          label: 'Max Active API Keys Per Client',
          value: `${settings.max_active_keys || 5} active keys`,
          env: 'MAX_ACTIVE_KEYS=5',
          note: 'Prevents credential sprawl on self-service tenants.',
        },
        {
          key: 'LOG_LEVEL',
          label: 'Server Logging Level',
          value: settings.log_level || 'INFO',
          env: 'LOG_LEVEL=INFO',
          note: 'Application log verbosity for FastAPI server and worker daemon.',
        },
      ],
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
          System Configuration & Diagnostics
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
          Active platform parameters, mail provider connectivity probes, and diagnostic dispatch tools
        </p>
      </div>

      {/* Interactive Diagnostics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {/* Test Email Dispatch Card */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface-card, #12141a)',
            border: '1px solid var(--border-subtle, #1f232f)',
            borderRadius: 'var(--radius-lg, 16px)',
            padding: '24px',
          }}
        >
          <div style={{ marginBottom: '14px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
              Dispatch Test Email
            </h2>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
              Send an immediate diagnostic email through the active mail provider ({settings.mail_provider || 'smtp'})
            </p>
          </div>

          <form onSubmit={handleSendTestEmail} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#8c93a7', marginBottom: '6px' }}>
                Recipient Email Address
              </label>
              <input
                type="email"
                required
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="developer@example.com"
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

            {testResult && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  backgroundColor: testResult.type === 'success' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  color: testResult.type === 'success' ? '#4ade80' : '#ef4444',
                  border: `1px solid ${testResult.type === 'success' ? 'rgba(74, 222, 128, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                }}
              >
                {testResult.text}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={sendingTest || !testRecipient.trim()}
              style={{ alignSelf: 'flex-start' }}
            >
              {sendingTest ? 'Sending Test...' : 'Send Test Message'}
            </button>
          </form>
        </div>

        {/* Connectivity Probe Card */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface-card, #12141a)',
            border: '1px solid var(--border-subtle, #1f232f)',
            borderRadius: 'var(--radius-lg, 16px)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ marginBottom: '14px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                Provider Connectivity Probe
              </h2>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
                Test low-level network socket connectivity and latency to the active outbound mail server
              </p>
            </div>

            <div
              style={{
                padding: '14px 16px',
                backgroundColor: '#161922',
                borderRadius: '10px',
                border: '1px solid #202431',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#8c93a7' }}>Configured Provider:</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
                  {settings.mail_provider === 'sendgrid' ? 'SendGrid Web API' : 'MailHog Local SMTP'}
                </span>
              </div>
              {probeResult && (
                <div style={{ marginTop: '12px', borderTop: '1px solid #202431', paddingTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12.5px', color: '#8c93a7' }}>Probe Status:</span>
                    <span className={`badge badge-${probeResult.status === 'ok' ? 'green' : 'red'}`}>
                      {probeResult.status === 'ok' ? 'Connected' : 'Connection Failed'}
                    </span>
                  </div>
                  {probeResult.latency_ms !== undefined && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12.5px', color: '#8c93a7' }}>Round-trip Latency:</span>
                      <span style={{ fontSize: '12.5px', color: '#4ade80', fontFamily: 'monospace' }}>
                        {probeResult.latency_ms} ms
                      </span>
                    </div>
                  )}
                  {probeResult.error && (
                    <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                      {probeResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={handleTestConnection}
            disabled={probing}
            style={{ alignSelf: 'flex-start' }}
          >
            {probing ? 'Probing Connection...' : 'Test Provider Connectivity'}
          </button>
        </div>
      </div>

      {/* Info notice about .env */}
      <div
        style={{
          padding: '16px 20px',
          backgroundColor: '#161922',
          border: '1px solid #202431',
          borderRadius: '12px',
          fontSize: '13px',
          color: 'var(--text-secondary, #8c93a7)',
          lineHeight: 1.5,
        }}
      >
        ℹ <strong style={{ color: '#ffffff' }}>Configuration Management:</strong> All operational parameters shown below are loaded directly from your server environment file (<code style={{ color: '#ffffff', fontFamily: 'monospace' }}>backend/.env</code>). To change any of these settings, update the respective environment variable and restart the containers with <code style={{ color: '#ffffff', fontFamily: 'monospace' }}>docker compose restart</code>.
      </div>

      {/* Configuration Group Cards */}
      {CONFIG_GROUPS.map((grp) => (
        <div
          key={grp.title}
          style={{
            backgroundColor: 'var(--bg-surface-card, #12141a)',
            border: '1px solid var(--border-subtle, #1f232f)',
            borderRadius: 'var(--radius-lg, 16px)',
            padding: '24px',
          }}
        >
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
              {grp.title}
            </h2>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
              {grp.description}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {grp.items.map((item) => (
              <div
                key={item.key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  backgroundColor: '#161922',
                  borderRadius: '10px',
                  border: '1px solid #202431',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div style={{ maxWidth: '60%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#ffffff' }}>
                      {item.label}
                    </span>
                    <span style={{ fontSize: '11px', color: '#8c93a7', fontFamily: 'monospace', backgroundColor: '#101218', padding: '1px 6px', borderRadius: '4px' }}>
                      {item.env}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted, #585f73)', marginTop: '4px' }}>
                    {item.note}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
                    {item.value}
                  </span>
                  {item.badge && (
                    <span className={`badge badge-${item.badgeType || 'gray'}`}>
                      {item.badge}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
