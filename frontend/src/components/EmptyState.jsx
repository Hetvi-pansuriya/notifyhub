import React from 'react'

/**
 * Friendly empty state component used when collections or tables are empty.
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionDisabled = false,
  secondaryActionLabel,
  onSecondaryAction,
  style = {},
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        backgroundColor: 'var(--bg-surface-card, #12141a)',
        border: '1px dashed var(--border-subtle, #1f232f)',
        borderRadius: 'var(--radius-lg, 16px)',
        minHeight: '260px',
        ...style,
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          backgroundColor: '#181b24',
          border: '1px solid #232836',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary, #8c93a7)',
          marginBottom: '16px',
        }}
      >
        {icon || (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
      </div>

      <div style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
        {title}
      </div>

      {description && (
        <div style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', maxWidth: '420px', lineHeight: 1.5, marginBottom: actionLabel ? '20px' : '0' }}>
          {description}
        </div>
      )}

      {(actionLabel || secondaryActionLabel) && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {actionLabel && (
            <button
              type="button"
              className="btn-primary"
              onClick={onAction}
              disabled={actionDisabled}
            >
              {actionLabel}
            </button>
          )}
          {secondaryActionLabel && (
            <button
              type="button"
              className="btn-secondary"
              onClick={onSecondaryAction}
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
