import React from 'react'

/**
 * Shimmering loading skeleton placeholder for cards, tables, text lines.
 */
export function Skeleton({
  variant = 'rect', // 'card' | 'rect' | 'circle' | 'text' | 'table-row'
  width,
  height,
  borderRadius,
  count = 1,
  style = {},
}) {
  const getBaseStyle = () => {
    switch (variant) {
      case 'circle':
        return {
          width: width || '36px',
          height: height || '36px',
          borderRadius: '50%',
        }
      case 'card':
        return {
          width: width || '100%',
          height: height || '120px',
          borderRadius: borderRadius || 'var(--radius-lg, 16px)',
        }
      case 'table-row':
        return {
          width: width || '100%',
          height: height || '44px',
          borderRadius: borderRadius || '6px',
        }
      case 'text':
        return {
          width: width || '60%',
          height: height || '14px',
          borderRadius: borderRadius || '4px',
        }
      case 'rect':
      default:
        return {
          width: width || '100%',
          height: height || '20px',
          borderRadius: borderRadius || '6px',
        }
    }
  }

  const base = getBaseStyle()

  if (count > 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="skeleton-shimmer"
            style={{
              ...base,
              ...style,
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className="skeleton-shimmer"
      style={{
        ...base,
        ...style,
      }}
    />
  )
}
