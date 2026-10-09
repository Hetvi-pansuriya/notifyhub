import React, { useState, useRef } from 'react'
import { formatDate, formatTime } from '../utils/date'

/**
 * Pure SVG interactive BarChart with rounded bars, hover highlight,
 * grid lines, and responsive tooltip.
 */
export function BarChart({
  data = [],
  height = 220,
  barColor = '#3b82f6',
  hoverColor = '#60a5fa',
  unit = 'emails',
  emptyMessage = 'No email activity recorded for this period.',
}) {
  const [hoverIndex, setHoverIndex] = useState(null)
  const containerRef = useRef(null)

  const items = (data || []).map((item, idx) => {
    const val = Number(item.count ?? item.value ?? 0)
    const label = item.bucket || item.time || item.timestamp || item.label || `Item ${idx}`
    return { value: val, label, raw: item }
  })

  if (items.length === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted, #585f73)',
          fontSize: '13px',
          border: '1px dashed var(--border-subtle, #1f232f)',
          borderRadius: 'var(--radius-md, 12px)',
        }}
      >
        {emptyMessage}
      </div>
    )
  }

  const values = items.map((d) => d.value)
  const maxVal = Math.max(...values, 5)
  const minVal = 0

  const width = 800
  const paddingX = 48
  const paddingY = 28
  const plotWidth = width - paddingX * 2
  const plotHeight = height - paddingY * 2

  const count = items.length
  // Slot width calculation
  const slotWidth = count > 0 ? plotWidth / count : plotWidth
  const barWidth = Math.max(3, Math.min(28, slotWidth * 0.65))

  const getY = (val) => {
    return height - paddingY - ((val - minVal) / (maxVal - minVal)) * plotHeight
  }

  // Active hover data
  const activeItem = hoverIndex !== null ? items[hoverIndex] : null

  let tooltipLabel = ''
  if (activeItem) {
    try {
      const d = new Date(activeItem.label)
      if (!isNaN(d.getTime())) {
        tooltipLabel = `${formatDate(activeItem.label)} ${formatTime(activeItem.label)}`
      } else {
        tooltipLabel = activeItem.label
      }
    } catch {
      tooltipLabel = activeItem.label
    }
  }

  return (
    <div
      ref={containerRef}
      onMouseLeave={() => setHoverIndex(null)}
      style={{
        position: 'relative',
        width: '100%',
        height,
        userSelect: 'none',
      }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
        preserveAspectRatio="none"
      >
        {/* Horizontal gridlines */}
        {[0, 0.33, 0.66, 1].map((pct, i) => {
          const y = height - paddingY - pct * plotHeight
          const tickVal = Math.round(minVal + pct * (maxVal - minVal))
          return (
            <g key={i}>
              <line
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="#1f232f"
                strokeWidth="1"
                strokeDasharray={i === 0 ? 'none' : '3 3'}
              />
              <text
                x={paddingX - 10}
                y={y + 4}
                fill="#585f73"
                fontSize="11"
                textAnchor="end"
                fontFamily="sans-serif"
              >
                {tickVal >= 1000 ? `${(tickVal / 1000).toFixed(1)}k` : tickVal}
              </text>
            </g>
          )
        })}

        {/* Bars */}
        {items.map((item, idx) => {
          const xCenter = paddingX + idx * slotWidth + slotWidth / 2
          const barX = xCenter - barWidth / 2
          const yTop = getY(item.value)
          const barH = Math.max(2, height - paddingY - yTop)
          const isHovered = hoverIndex === idx

          return (
            <g
              key={idx}
              onMouseEnter={() => setHoverIndex(idx)}
              style={{ cursor: 'pointer' }}
            >
              {/* Invisible wider hover hit area */}
              <rect
                x={paddingX + idx * slotWidth}
                y={paddingY}
                width={slotWidth}
                height={plotHeight}
                fill="transparent"
              />
              {/* The visible bar */}
              <rect
                x={barX}
                y={yTop}
                width={barWidth}
                height={barH}
                rx={Math.min(4, barWidth / 2)}
                fill={isHovered ? hoverColor : barColor}
                opacity={isHovered ? 1 : 0.85}
                style={{ transition: 'fill 0.15s, opacity 0.15s' }}
              />
            </g>
          )
        })}
      </svg>

      {/* Floating Tooltip */}
      {activeItem && hoverIndex !== null && (
        <div
          style={{
            position: 'absolute',
            left: `${((paddingX + hoverIndex * slotWidth + slotWidth / 2) / width) * 100}%`,
            top: `${Math.max(6, (getY(activeItem.value) / height) * 100 - 20)}%`,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'none',
            backgroundColor: '#171a23',
            border: '1px solid #2d3345',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '11px',
            color: '#ffffff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          <div style={{ color: '#8c93a7', marginBottom: '2px' }}>{tooltipLabel}</div>
          <div style={{ fontWeight: 600 }}>
            {activeItem.value.toLocaleString()} <span style={{ color: '#8c93a7', fontWeight: 400 }}>{unit}</span>
          </div>
        </div>
      )}
    </div>
  )
}
