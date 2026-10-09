import React, { useState } from 'react'
import { formatDate } from '../utils/date'

/**
 * Pure SVG interactive RateLimitChart with horizontal dashed limit guideline,
 * peak req/s line or bars, and red dot indicators for 429 rejection hits.
 */
export function RateLimitChart({
  data = [],
  rateLimit = 50,
  height = 220,
}) {
  const [hoverIndex, setHoverIndex] = useState(null)

  if (!data || data.length === 0) {
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
        No rate limit telemetry recorded for this period.
      </div>
    )
  }

  const peaks = data.map((d) => d.peak_requests_per_sec || 0)
  const maxVal = Math.max(...peaks, rateLimit, 10)
  const minVal = 0

  const width = 800
  const paddingX = 48
  const paddingY = 28
  const plotWidth = width - paddingX * 2
  const plotHeight = height - paddingY * 2

  const getX = (i) => {
    if (data.length === 1) return paddingX + plotWidth / 2
    return paddingX + (i / (data.length - 1)) * plotWidth
  }

  const getY = (val) => {
    return height - paddingY - ((val - minVal) / (maxVal - minVal)) * plotHeight
  }

  // Path for peak requests
  const coords = data.map((d, i) => ({
    x: getX(i),
    y: getY(d.peak_requests_per_sec || 0),
    data: d,
  }))

  const pathD = coords.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`
  }, '')

  const limitY = getY(rateLimit)
  const activeItem = hoverIndex !== null ? coords[hoverIndex] : null

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        userSelect: 'none',
      }}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
        preserveAspectRatio="none"
      >
        {/* Horizontal grid lines */}
        {[0, 0.5, 1].map((pct, i) => {
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
              />
              <text
                x={paddingX - 10}
                y={y + 4}
                fill="#585f73"
                fontSize="11"
                textAnchor="end"
              >
                {tickVal}
              </text>
            </g>
          )
        })}

        {/* Rate Limit Horizontal Dashed Line */}
        <line
          x1={paddingX}
          y1={limitY}
          x2={width - paddingX}
          y2={limitY}
          stroke="#f59e0b"
          strokeWidth="1.8"
          strokeDasharray="4 4"
        />
        <text
          x={width - paddingX + 6}
          y={limitY + 4}
          fill="#f59e0b"
          fontSize="10.5"
          fontWeight="600"
        >
          {rateLimit}/s limit
        </text>

        {/* Peak req/s Line */}
        <path
          d={pathD}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points & 429 Red Markers */}
        {coords.map((pt, i) => {
          const has429 = (pt.data.rejected_429 || 0) > 0
          return (
            <g
              key={i}
              onMouseEnter={() => setHoverIndex(i)}
              style={{ cursor: 'pointer' }}
            >
              {/* Invisible larger hit target */}
              <circle cx={pt.x} cy={pt.y} r="12" fill="transparent" />

              {/* Normal Point */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={has429 ? 5 : (hoverIndex === i ? 4 : 2.5)}
                fill={has429 ? '#ef4444' : '#3b82f6'}
                stroke={has429 ? '#ffffff' : '#12141a'}
                strokeWidth={has429 ? '2' : '1'}
              />

              {/* 429 Red Marker Halo */}
              {has429 && (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="9"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  opacity="0.6"
                />
              )}
            </g>
          )
        })}

        {/* Hover Crosshair Guideline */}
        {activeItem && (
          <line
            x1={activeItem.x}
            y1={paddingY}
            x2={activeItem.x}
            y2={height - paddingY}
            stroke="rgba(255, 255, 255, 0.25)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
        )}
      </svg>

      {/* Floating Tooltip */}
      {activeItem && (
        <div
          style={{
            position: 'absolute',
            left: `${(activeItem.x / width) * 100}%`,
            top: `${Math.max(8, (activeItem.y / height) * 100 - 20)}%`,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'none',
            backgroundColor: '#171a23',
            border: '1px solid #2d3345',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '11px',
            color: '#ffffff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          <div style={{ color: '#8c93a7', marginBottom: '2px' }}>
            {formatDate(activeItem.data.date)}
          </div>
          <div style={{ fontWeight: 600 }}>
            Peak: {activeItem.data.peak_requests_per_sec || 0} req/s
          </div>
          {activeItem.data.rejected_429 > 0 ? (
            <div style={{ color: '#f87171', marginTop: '2px', fontWeight: 600 }}>
              ⚠ {activeItem.data.rejected_429} rate limit hit (429)
            </div>
          ) : (
            <div style={{ color: '#34d399', marginTop: '2px' }}>
              ✓ No 429 rejections
            </div>
          )}
        </div>
      )}
    </div>
  )
}
