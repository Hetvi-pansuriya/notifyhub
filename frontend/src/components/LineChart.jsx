import React, { useState, useRef } from 'react'
import { formatTime, formatDate } from '../utils/date'

/**
 * Pure SVG interactive LineChart with hover crosshair, glowing active point,
 * semi-transparent area fill, and non-clipping tooltip.
 */
export function LineChart({
  data = [],
  height = 220,
  strokeColor = '#3b82f6',
  fillColor = 'rgba(59, 130, 246, 0.15)',
  unit = 'requests',
  emptyMessage = 'No request activity recorded for this period.',
}) {
  const [hoverIndex, setHoverIndex] = useState(null)
  const containerRef = useRef(null)

  // Normalize data points
  const pointsData = (data || []).map((item, idx) => {
    const val = Number(item.count ?? item.value ?? 0)
    const label = item.bucket || item.time || item.timestamp || item.label || `Point ${idx}`
    return { value: val, label, raw: item }
  })

  if (pointsData.length === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted, #71717a)',
          fontSize: '13px',
          border: '1px dashed var(--border-subtle, #232325)',
          borderRadius: 'var(--radius-md, 12px)',
        }}
      >
        {emptyMessage}
      </div>
    )
  }

  const values = pointsData.map((d) => d.value)
  const maxVal = Math.max(...values, 5)
  const minVal = 0

  const width = 800
  const paddingX = 48
  const paddingY = 28
  const plotWidth = width - paddingX * 2
  const plotHeight = height - paddingY * 2

  const getX = (i) => {
    if (pointsData.length === 1) return paddingX + plotWidth / 2
    return paddingX + (i / (pointsData.length - 1)) * plotWidth
  }

  const getY = (val) => {
    if (maxVal === minVal) return height - paddingY - plotHeight / 2
    return height - paddingY - ((val - minVal) / (maxVal - minVal)) * plotHeight
  }

  // Build SVG path
  const coords = pointsData.map((d, i) => ({ x: getX(i), y: getY(d.value) }))
  const pathD = coords.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`
  }, '')

  // Area path (closed at the bottom)
  const areaD = coords.length > 0
    ? `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${height - paddingY} L ${coords[0].x.toFixed(1)} ${height - paddingY} Z`
    : ''

  const handleMouseMove = (e) => {
    if (!containerRef.current || pointsData.length <= 1) return
    const rect = containerRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const relX = (mouseX / rect.width) * width

    // Find closest index
    let closestIdx = 0
    let minDiff = Infinity
    for (let i = 0; i < pointsData.length; i++) {
      const diff = Math.abs(getX(i) - relX)
      if (diff < minDiff) {
        minDiff = diff
        closestIdx = i
      }
    }
    setHoverIndex(closestIdx)
  }

  const activePoint = hoverIndex !== null ? coords[hoverIndex] : null
  const activeData = hoverIndex !== null ? pointsData[hoverIndex] : null

  // Format tooltip label
  let tooltipTimeLabel = ''
  if (activeData) {
    try {
      const d = new Date(activeData.label)
      if (!isNaN(d.getTime())) {
        tooltipTimeLabel = `${formatDate(activeData.label)} ${formatTime(activeData.label)}`
      } else {
        tooltipTimeLabel = activeData.label
      }
    } catch {
      tooltipTimeLabel = activeData.label
    }
  }

  // Calculate tooltip X position clamped so it doesn't clip
  const tooltipWidth = 140
  let tooltipX = activePoint ? activePoint.x : 0
  if (tooltipX - tooltipWidth / 2 < 10) {
    tooltipX = tooltipWidth / 2 + 10
  } else if (tooltipX + tooltipWidth / 2 > width - 10) {
    tooltipX = width - tooltipWidth / 2 - 10
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
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
        <defs>
          <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
          <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

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
                stroke="#232325"
                strokeWidth="1"
                strokeDasharray={i === 0 ? 'none' : '3 3'}
              />
              <text
                x={paddingX - 10}
                y={y + 4}
                fill="#71717a"
                fontSize="11"
                textAnchor="end"
                fontFamily="sans-serif"
              >
                {tickVal >= 1000 ? `${(tickVal / 1000).toFixed(1)}k` : tickVal}
              </text>
            </g>
          )
        })}

        {/* X-axis time labels */}
        {(() => {
          if (pointsData.length <= 1) return null
          const step = Math.max(1, Math.floor(pointsData.length / 5))
          const indices = []
          for (let i = 0; i < pointsData.length; i += step) {
            indices.push(i)
          }
          if (indices[indices.length - 1] !== pointsData.length - 1) {
            indices.push(pointsData.length - 1)
          }
          return indices.map((idx) => {
            const rawLabel = pointsData[idx]?.label
            let text = ''
            try {
              const d = new Date(rawLabel)
              if (!isNaN(d.getTime())) {
                text = d.getHours() !== 0 || d.getMinutes() !== 0 ? formatTime(rawLabel) : formatDate(rawLabel)
              } else {
                text = String(rawLabel).slice(0, 10)
              }
            } catch {
              text = String(rawLabel).slice(0, 10)
            }
            return (
              <text
                key={idx}
                x={getX(idx)}
                y={height - 8}
                fill="#585f73"
                fontSize="10"
                textAnchor={idx === 0 ? 'start' : idx === pointsData.length - 1 ? 'end' : 'middle'}
                fontFamily="sans-serif"
              >
                {text}
              </text>
            )
          })
        })()}

        {/* Filled Area */}
        {areaD && <path d={areaD} fill="url(#lineAreaGrad)" />}

        {/* Main Line */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Hover Crosshair Guideline */}
        {activePoint && (
          <line
            x1={activePoint.x}
            y1={paddingY}
            x2={activePoint.x}
            y2={height - paddingY}
            stroke="rgba(255, 255, 255, 0.25)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
        )}

        {/* Hover Circle with Glow */}
        {activePoint && (
          <g filter="url(#glowEffect)">
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="6"
              fill={strokeColor}
              stroke="#ffffff"
              strokeWidth="2.5"
            />
          </g>
        )}
      </svg>

      {/* Floating Tooltip HTML Overlay */}
      {activePoint && (
        <div
          style={{
            position: 'absolute',
            left: `${(tooltipX / width) * 100}%`,
            top: `${Math.max(8, (activePoint.y / height) * 100 - 24)}%`,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'none',
            backgroundColor: '#18181a',
            border: '1px solid #232325',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '11px',
            color: '#ffffff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          <div style={{ color: '#8c93a7', marginBottom: '2px' }}>{tooltipTimeLabel}</div>
          <div style={{ fontWeight: 600 }}>
            {activeData.value.toLocaleString()} <span style={{ color: '#8c93a7', fontWeight: 400 }}>{unit}</span>
          </div>
        </div>
      )}
    </div>
  )
}
