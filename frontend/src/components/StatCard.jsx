import React from 'react'

/**
 * Metric/Stat card used across Client and Admin consoles.
 */
export function StatCard({
  title,
  value,
  subtext,
  badge,
  badgeType = 'green', // 'green' | 'orange' | 'red' | 'gray' | 'blue'
  icon,
  onClick,
}) {
  const badgeStyles = {
    green: { bg: 'rgba(16, 185, 129, 0.12)', text: '#34d399' },
    orange: { bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24' },
    red: { bg: 'rgba(239, 68, 68, 0.12)', text: '#f87171' },
    blue: { bg: 'rgba(59, 130, 246, 0.12)', text: '#60a5fa' },
    gray: { bg: 'rgba(107, 114, 128, 0.12)', text: '#9ca3af' },
  }

  const badgeTheme = badgeStyles[badgeType] || badgeStyles.gray

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: 'var(--bg-surface-card, #12141a)',
        border: '1px solid var(--border-subtle, #1f232f)',
        borderRadius: 'var(--radius-lg, 16px)',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s ease, border-color 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #8c93a7)' }}>
          {title}
        </span>
        {icon && (
          <span style={{ color: 'var(--text-muted, #585f73)', display: 'flex' }}>
            {icon}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {value !== undefined && value !== null ? value.toLocaleString?.() ?? value : '-'}
        </div>
        {badge && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '9999px',
              backgroundColor: badgeTheme.bg,
              color: badgeTheme.text,
            }}
          >
            {badge}
          </span>
        )}
      </div>

      {subtext && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted, #585f73)' }}>
          {subtext}
        </div>
      )}
    </div>
  )
}
