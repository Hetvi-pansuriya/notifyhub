import React from 'react'

/**
 * Generates ISO string bounds and appropriate bucket for stats queries.
 */
export function getRangePayload(key) {
  const now = new Date()
  let from = new Date(now)
  let bucket = 'day'
  let label = 'Last 7 days'

  if (key === '7d') {
    from.setDate(now.getDate() - 7)
    bucket = 'day'
    label = 'Last 7 days'
  } else if (key === '30d') {
    from.setDate(now.getDate() - 30)
    bucket = 'day'
    label = 'Last month'
  } else if (key === '90d') {
    from.setDate(now.getDate() - 90)
    bucket = 'day'
    label = 'Last 3 months'
  } else if (key === '1y') {
    from.setDate(now.getDate() - 365)
    bucket = 'month'
    label = 'Last year'
  }

  return {
    key,
    label,
    from: from.toISOString(),
    to: now.toISOString(),
    bucket,
  }
}

export const RANGE_OPTIONS = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last month' },
  { key: '90d', label: 'Last 3 months' },
  { key: '1y', label: 'Last year' },
]

/**
 * Shared RangePicker component emitting { from, to, bucket, label }
 */
export function RangePicker({ selectedKey = '7d', onChange }) {
  const handleClick = (key) => {
    if (onChange) {
      onChange(getRangePayload(key))
    }
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        backgroundColor: 'var(--bg-surface-card, #141415)',
        padding: '3px',
        borderRadius: 'var(--radius-full, 9999px)',
        border: '1px solid var(--border-subtle, #232325)',
      }}
    >
      {RANGE_OPTIONS.map((opt) => {
        const isActive = selectedKey === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => handleClick(opt.key)}
            style={{
              padding: '5px 14px',
              borderRadius: 'var(--radius-full, 9999px)',
              fontSize: '12px',
              fontWeight: isActive ? 600 : 500,
              color: isActive ? '#ffffff' : 'var(--text-secondary, #9a9a9f)',
              backgroundColor: isActive ? '#222226' : 'transparent',
              border: isActive ? '1px solid #33333a' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
