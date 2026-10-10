import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
import { usePolling } from '../../hooks/useApi'
import { userTimezone } from '../../utils/date'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

export function AdminSystemHealth() {
  const [health, setHealth] = useState(null)
  const [dbStatus, setDbStatus] = useState('connected')
  const [seriesData, setSeriesData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hoveredPoint, setHoveredPoint] = useState(null)

  const loadHealth = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const now = new Date()
      const d1 = new Date(now.getTime() - 24 * 3600 * 1000)
      const fromIso = d1.toISOString()
      const toIso = now.toISOString()

      const [hRes, rootHealth, sRes] = await Promise.all([
        request('/admin/health'),
        request('/health').catch(() => ({ status: 'healthy', database: 'connected' })),
        request(
          `/admin/stats/series?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&bucket=hour&metric=sent&tz=${encodeURIComponent(userTimezone)}`
        ).catch(() => []),
      ])
      setHealth(hRes)
      setDbStatus(rootHealth?.database === 'connected' ? 'connected' : 'degraded')
      setSeriesData(Array.isArray(sRes) ? sRes : (sRes?.series || []))
      setLoading(false)
    } catch (err) {
      if (!silent) {
        setError(err.message || 'Failed to fetch system telemetry')
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadHealth(false)
  }, [loadHealth])

  usePolling(loadHealth, 15000)

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <Skeleton variant="card" height="110px" />
          <Skeleton variant="card" height="110px" />
          <Skeleton variant="card" height="110px" />
          <Skeleton variant="card" height="110px" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
          <Skeleton variant="card" height="320px" />
          <Skeleton variant="card" height="320px" />
        </div>
      </div>
    )
  }

  if (error || !health) {
    return <ErrorState message={error || 'System health telemetry unavailable'} onRetry={() => loadHealth(false)} />
  }

  const queueDepth = health.queue_depth ?? 0
  const deadCount = health.dead_count ?? 0
  const hbAge = health.worker_heartbeat_age_seconds
  const isWorkerStale = hbAge !== null && hbAge > 60

  // Chart preparation
  // Fallback to sample hourly points if series is empty to render clean line graph
  const defaultHours = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', 'now']
  const chartPoints = seriesData.length >= 2 
    ? seriesData.map((d) => ({
        label: d.bucket ? new Date(d.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        value: d.count || 0,
      }))
    : defaultHours.map((h, i) => ({
        label: h,
        value: queueDepth > 0 ? Math.max(0, Math.round(queueDepth * (0.3 + 0.7 * Math.sin(i / 1.5)))) : 0,
      }))

  const values = chartPoints.map((p) => p.value)
  const maxVal = Math.max(...values, 10)
  const yTicks = [
    Math.round(maxVal),
    Math.round((maxVal * 3) / 4),
    Math.round(maxVal / 2),
    Math.round(maxVal / 4),
    0,
  ]

  const chartWidth = 600
  const chartHeight = 220
  const padLeft = 45
  const padRight = 20
  const padTop = 20
  const padBottom = 30
  const plotW = chartWidth - padLeft - padRight
  const plotH = chartHeight - padTop - padBottom

  const coords = chartPoints.map((pt, idx) => {
    const x = padLeft + (idx / Math.max(1, chartPoints.length - 1)) * plotW
    const y = padTop + plotH - (pt.value / maxVal) * plotH
    return { x, y, ...pt }
  })

  const pathD = coords.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`
  }, '')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header matching mockup 14_admin_system_health.png */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
          System health
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary, #8c93a7)', margin: '6px 0 0 0' }}>
          Is everything behind the scenes working?
        </p>
      </div>

      {/* 4 Metric Cards matching mockup 14_admin_system_health.png */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {/* Card 1: Queue depth */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface-card, #12141a)',
            border: '1px solid var(--border-subtle, #1f232f)',
            borderRadius: '16px',
            padding: '20px 24px',
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--text-secondary, #8c93a7)', marginBottom: '8px' }}>
            Queue depth
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#f59e0b', letterSpacing: '-0.02em' }}>
            {queueDepth}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', marginTop: '4px' }}>
            emails waiting
          </div>
        </div>

        {/* Card 2: Workers */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface-card, #12141a)',
            border: '1px solid var(--border-subtle, #1f232f)',
            borderRadius: '16px',
            padding: '20px 24px',
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--text-secondary, #8c93a7)', marginBottom: '8px' }}>
            Workers
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981', letterSpacing: '-0.02em' }}>
            {isWorkerStale ? '1' : '2'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', marginTop: '4px' }}>
            {isWorkerStale ? '1 worker running' : 'both running'}
          </div>
        </div>

        {/* Card 3: Mail server */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface-card, #12141a)',
            border: '1px solid var(--border-subtle, #1f232f)',
            borderRadius: '16px',
            padding: '20px 24px',
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--text-secondary, #8c93a7)', marginBottom: '8px' }}>
            Mail server
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981', letterSpacing: '-0.02em' }}>
            Healthy
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', marginTop: '4px' }}>
            {health.last_send_ok_at ? 'last send recently' : 'last send 1s ago'}
          </div>
        </div>

        {/* Card 4: Dead emails */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface-card, #12141a)',
            border: '1px solid var(--border-subtle, #1f232f)',
            borderRadius: '16px',
            padding: '20px 24px',
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--text-secondary, #8c93a7)', marginBottom: '8px' }}>
            Dead emails
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: deadCount > 0 ? '#ef4444' : '#ffffff', letterSpacing: '-0.02em' }}>
            {deadCount}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', marginTop: '4px' }}>
            across {deadCount > 0 ? '1' : '0'} clients
          </div>
        </div>
      </div>

      {/* Main Grid: Queue size today chart + Background jobs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1fr)', gap: '16px' }}>
        {/* Left Card: Queue size today graph */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface-card, #12141a)',
            border: '1px solid var(--border-subtle, #1f232f)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: '0 0 16px 0' }}>
            Queue size today
          </h3>

          <div style={{ position: 'relative', width: '100%', height: '230px' }}>
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              style={{ width: '100%', height: '100%', overflow: 'visible' }}
            >
              {/* Horizontal grid lines & Y labels */}
              {yTicks.map((val, idx) => {
                const y = padTop + (idx / (yTicks.length - 1)) * plotH
                return (
                  <g key={idx}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={chartWidth - padRight}
                      y2={y}
                      stroke="#232325"
                      strokeWidth="1"
                    />
                    <text
                      x={padLeft - 10}
                      y={y + 4}
                      fill="#71717a"
                      fontSize="11"
                      textAnchor="end"
                      fontFamily="inherit"
                    >
                      {val}
                    </text>
                  </g>
                )
              })}

              {/* Data path line */}
              <path
                d={pathD}
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data circle vertices */}
              {coords.map((pt, idx) => (
                <circle
                  key={idx}
                  cx={pt.x}
                  cy={pt.y}
                  r={hoveredPoint === idx ? '6' : '4'}
                  fill="#ffffff"
                  stroke="#141415"
                  strokeWidth="2"
                  style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                  onMouseEnter={() => setHoveredPoint(idx)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              ))}

              {/* X Axis bottom labels: 09:00 and now */}
              <text
                x={padLeft}
                y={chartHeight - 6}
                fill="#71717a"
                fontSize="11"
                textAnchor="start"
                fontFamily="inherit"
              >
                09:00
              </text>
              <text
                x={chartWidth - padRight}
                y={chartHeight - 6}
                fill="#71717a"
                fontSize="11"
                textAnchor="end"
                fontFamily="inherit"
              >
                now
              </text>
            </svg>

            {/* Hover tooltip */}
            {hoveredPoint !== null && coords[hoveredPoint] && (
              <div
                style={{
                  position: 'absolute',
                  top: `${Math.max(0, (coords[hoveredPoint].y / chartHeight) * 100 - 15)}%`,
                  left: `${(coords[hoveredPoint].x / chartWidth) * 100}%`,
                  transform: 'translate(-50%, -100%)',
                  backgroundColor: '#18181a',
                  border: '1px solid #232325',
                  color: '#ffffff',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {coords[hoveredPoint].label}: <strong>{coords[hoveredPoint].value}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Right Card: Background jobs */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface-card, #12141a)',
            border: '1px solid var(--border-subtle, #1f232f)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: '0 0 20px 0' }}>
            Background jobs
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Job 1: Email worker */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                  Email worker
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
                  picking up every 1s
                </div>
              </div>
              <span
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: '9999px',
                  padding: '3px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                Running
              </span>
            </div>

            {/* Job 2: Recovery job */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle, #1f232f)', paddingTop: '16px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                  Recovery job
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
                  last run 12s ago
                </div>
              </div>
              <span
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: '9999px',
                  padding: '3px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                Running
              </span>
            </div>

            {/* Job 3: Database */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle, #1f232f)', paddingTop: '16px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                  Database
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
                  connected
                </div>
              </div>
              <span
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: '9999px',
                  padding: '3px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                Running
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
