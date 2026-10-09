import React from 'react'

/**
 * Friendly error state component with retry action.
 */
export function ErrorState({
  title = 'Unable to load content',
  message = 'An unexpected error occurred while communicating with the server.',
  onRetry,
  style = {},
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        textAlign: 'center',
        backgroundColor: 'var(--bg-surface-card, #12141a)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        borderRadius: 'var(--radius-lg, 16px)',
        minHeight: '220px',
        ...style,
      }}
    >
      <div
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f87171',
          marginBottom: '14px',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <div style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
        {title}
      </div>

      <div style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', maxWidth: '400px', lineHeight: 1.5, marginBottom: onRetry ? '18px' : '0' }}>
        {message}
      </div>

      {onRetry && (
        <button
          type="button"
          className="btn-secondary"
          onClick={onRetry}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Try again
        </button>
      )}
    </div>
  )
}
