import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

export function AdminSettings() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
          value: `${(settings.global_daily_limit || 300).toLocaleString()} emails/day`,
          env: 'GLOBAL_DAILY_LIMIT=...',
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
          env: 'DEFAULT_PLAN_NAME=... / DEFAULT_PLAN_MONTHLY_LIMIT=...',
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
          value: `${settings.lock_seconds || 120}s lock timeout · ${settings.reaper_seconds || 60}s sweep`,
          env: 'LOCK_SECONDS=... / REAPER_SECONDS=...',
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
          env: 'LOG_LEVEL=...',
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
          System Configuration
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
          Active platform parameters, security safeguards, and environment configuration (read-only)
        </p>
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
