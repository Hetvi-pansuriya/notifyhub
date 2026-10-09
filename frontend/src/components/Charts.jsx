import React, { useState } from 'react';

/**
 * Interactive SVG Line & Candle Chart
 * Matches Mockup 01, 06, 09, 14
 */
export function SparklineChart({
  data = [],
  mode = 'line', // 'line' or 'candles'
  height = 200,
  strokeColor = '#ffffff',
  highlightLast = true,
  unit = 'requests',
  timeLabel = 'today',
}) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!data || data.length === 0) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>No data</div>;
  }

  const values = data.map(d => d.value);
  const maxVal = Math.max(...values, 100);
  const minVal = 0;
  const paddingX = 40;
  const paddingY = 25;
  const chartWidth = 720;
  const chartHeight = height;

  const getX = (i) => paddingX + (i / (data.length - 1)) * (chartWidth - paddingX * 2);
  const getY = (val) => chartHeight - paddingY - ((val - minVal) / (maxVal - minVal)) * (chartHeight - paddingY * 2);

  // Generate smooth SVG path
  const points = data.map((d, i) => `${getX(i)},${getY(d.value)}`);
  const pathD = points.length > 1 ? `M ${points.join(' L ')}` : '';

  return (
    <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        style={{ width: '100%', height, overflow: 'visible' }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const y = chartHeight - paddingY - pct * (chartHeight - paddingY * 2);
          const labelVal = Math.round(minVal + pct * (maxVal - minVal));
          return (
            <g key={i}>
              <line
                x1={paddingX}
                y1={y}
                x2={chartWidth - paddingX}
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
                {labelVal >= 1000 ? labelVal.toLocaleString() : labelVal}
              </text>
            </g>
          );
        })}

        {mode === 'candles' ? (
          // Candle mode
          data.map((d, i) => {
            const x = getX(i);
            const y = getY(d.value);
            const barW = 12;
            return (
              <g key={i}>
                <line x1={x} y1={y - 10} x2={x} y2={chartHeight - paddingY} stroke="#3b82f6" strokeWidth="1.5" />
                <rect
                  x={x - barW / 2}
                  y={y}
                  width={barW}
                  height={Math.max(chartHeight - paddingY - y, 4)}
                  fill={i === data.length - 1 ? '#10b981' : '#252a38'}
                  rx="2"
                />
              </g>
            );
          })
        ) : (
          // Line mode
          <>
            <path
              d={pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {data.map((d, i) => {
              const x = getX(i);
              const y = getY(d.value);
              const isLast = i === data.length - 1;
              const isHovered = hoverIndex === i;

              return (
                <g key={i} onMouseEnter={() => setHoverIndex(i)} style={{ cursor: 'pointer' }}>
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? 6 : (isLast && highlightLast ? 5 : 3.5)}
                    fill={isLast && highlightLast ? '#10b981' : '#ffffff'}
                    stroke={isLast && highlightLast ? '#0a0b0e' : '#12141a'}
                    strokeWidth="2"
                  />
                  {/* Invisible hit target for smooth hover */}
                  <circle cx={x} cy={y} r="14" fill="transparent" />
                </g>
              );
            })}
          </>
        )}

        {/* X-axis time labels */}
        {data.filter((_, i) => i % Math.ceil(data.length / 6) === 0 || i === data.length - 1).map((d, i) => (
          <text
            key={i}
            x={getX(data.indexOf(d))}
            y={chartHeight - 4}
            fill="#585f73"
            fontSize="11"
            textAnchor="middle"
          >
            {d.time || `${i * 3}:00`}
          </text>
        ))}
      </svg>

      {/* Hover tooltip */}
      {hoverIndex !== null && (
        <div
          style={{
            position: 'absolute',
            left: `${(getX(hoverIndex) / chartWidth) * 100}%`,
            top: `${(getY(data[hoverIndex].value) / chartHeight) * 100}%`,
            transform: 'translate(-50%, -120%)',
            backgroundColor: '#161922',
            border: '1px solid #282d3d',
            borderRadius: '8px',
            padding: '6px 12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: '11px', color: '#8c93a7' }}>{data[hoverIndex].time || 'Time'} {timeLabel}</div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
            {data[hoverIndex].value.toLocaleString()} {unit}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Bar Chart for "Emails sent per day"
 * Matches Mockup 06 & 11
 */
export function DailyBarChart({ data = [], height = 180 }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  const values = data.map(d => d.value);
  const maxVal = Math.max(...values, 2000);
  const chartHeight = height;
  const paddingY = 24;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', height, gap: '6px', paddingTop: paddingY }}>
        {data.map((d, i) => {
          const barHeightPct = Math.min((d.value / maxVal) * 100, 100);
          const isHovered = hoverIndex === i;
          return (
            <div
              key={i}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <div
                style={{
                  width: '100%',
                  height: `${Math.max(barHeightPct, 6)}%`,
                  backgroundColor: isHovered ? '#ffffff' : '#d1d5db',
                  borderRadius: '3px 3px 0 0',
                  transition: 'background-color 0.15s ease',
                  cursor: 'pointer',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Axis markers */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: '#585f73' }}>
        <span>1</span>
        <span>5</span>
        <span>10</span>
        <span>15</span>
        <span>20</span>
        <span>25</span>
        <span>30</span>
      </div>

      {hoverIndex !== null && (
        <div
          style={{
            position: 'absolute',
            left: `${((hoverIndex + 0.5) / data.length) * 100}%`,
            top: '0',
            transform: 'translateX(-50%)',
            backgroundColor: '#161922',
            border: '1px solid #282d3d',
            borderRadius: '6px',
            padding: '4px 10px',
            fontSize: '12px',
            color: '#fff',
            whiteSpace: 'nowrap',
          }}
        >
          Day {hoverIndex + 1}: {data[hoverIndex].value.toLocaleString()} emails
        </div>
      )}
    </div>
  );
}

/**
 * Rate limit chart with dotted threshold line
 * Matches Mockup 06
 */
export function RateLimitChart({ data = [], limit = 50, height = 180 }) {
  const paddingX = 40;
  const paddingY = 25;
  const chartWidth = 720;
  const chartHeight = height;
  const maxVal = 60;

  const getX = (i) => paddingX + (i / (data.length - 1)) * (chartWidth - paddingX * 2);
  const getY = (val) => chartHeight - paddingY - (val / maxVal) * (chartHeight - paddingY * 2);
  const limitY = getY(limit);

  const points = data.map((d, i) => `${getX(i)},${getY(d.value)}`);

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: '100%', height, overflow: 'visible' }}>
        {/* Horizontal grid lines */}
        {[0, 14, 29, 43, 57].map((val, i) => {
          const y = getY(val);
          return (
            <g key={i}>
              <line x1={paddingX} y1={y} x2={chartWidth - paddingX} y2={y} stroke="#1b1f2b" strokeWidth="1" />
              <text x={paddingX - 10} y={y + 4} fill="#585f73" fontSize="11" textAnchor="end">{val}</text>
            </g>
          );
        })}

        {/* Dotted limit line */}
        <line
          x1={paddingX}
          y1={limitY}
          x2={chartWidth - paddingX}
          y2={limitY}
          stroke="#f59e0b"
          strokeDasharray="4 4"
          strokeWidth="1.5"
        />
        <text
          x={chartWidth - paddingX}
          y={limitY - 6}
          fill="#f59e0b"
          fontSize="11"
          textAnchor="end"
          fontWeight="500"
        >
          your limit · {limit}/s
        </text>

        {/* Actual Rate Line */}
        <path d={`M ${points.join(' L ')}`} fill="none" stroke="#ffffff" strokeWidth="2" />

        {/* Points */}
        {data.map((d, i) => {
          const x = getX(i);
          const y = getY(d.value);
          const isAtLimit = d.value >= limit;

          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={isAtLimit ? 5 : 3.5}
              fill={isAtLimit ? '#ef4444' : '#ffffff'}
              stroke="#0a0b0e"
              strokeWidth="2"
            />
          );
        })}

        {/* Time labels */}
        {data.map((d, i) => {
          if (i % 2 !== 0 && i !== data.length - 1) return null;
          return (
            <text key={i} x={getX(i)} y={chartHeight - 4} fill="#585f73" fontSize="11" textAnchor="middle">
              {d.time}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
