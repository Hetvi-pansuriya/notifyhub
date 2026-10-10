import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
import { formatDateTime, formatRelative } from '../../utils/date'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

const STATUS_FILTERS = [
  { label: 'All', value: null },
  { label: 'Sent', value: 'sent' },
  { label: 'In queue', value: 'queued' },
  { label: 'Failed', value: 'dead' },
]

const PAGE_SIZE = 20

export function ClientDeliveries({ onSelectDelivery }) {
  const [filter, setFilter] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)

  const loadDeliveries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let url = `/api/deliveries?limit=${PAGE_SIZE + 1}&offset=${page * PAGE_SIZE}`
      if (filter) {
        url += `&status=${encodeURIComponent(filter)}`
      }
      const res = await request(url)
      const items = res || []
      if (items.length > PAGE_SIZE) {
        setHasMore(true)
        setDeliveries(items.slice(0, PAGE_SIZE))
      } else {
        setHasMore(false)
        setDeliveries(items)
      }
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to load deliveries')
      setLoading(false)
    }
  }, [filter, page])

  useEffect(() => {
    loadDeliveries()
  }, [loadDeliveries])

  // Filter client-side by search query if search is entered
  const displayedDeliveries = deliveries.filter((d) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      d.id?.toLowerCase().includes(q) ||
      d.recipient_email?.toLowerCase().includes(q) ||
      d.rendered_subject?.toLowerCase().includes(q) ||
      d.event_type?.toLowerCase().includes(q)
    )
  })

  const getStatusBadge = (status) => {
    const s = status?.toLowerCase()
    switch (s) {
      case 'sent':
        return <span className="badge badge-green">Sent</span>
      case 'queued':
        return <span className="badge badge-orange">In queue</span>
      case 'dead':
      case 'failed':
        return <span className="badge badge-red">Failed</span>
      case 'skipped':
        return <span className="badge badge-gray">Skipped</span>
      case 'expired':
        return <span className="badge badge-gray">Expired</span>
      default:
        return <span className="badge badge-gray">{status}</span>
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
          Deliveries
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
          Historical record of all emails dispatched through the NotifyHub API
        </p>
      </div>

      {/* Main Table Card */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface-card, #12141a)',
          border: '1px solid var(--border-subtle, #1f232f)',
          borderRadius: 'var(--radius-lg, 16px)',
          padding: '24px',
        }}
      >
        {/* Filter and Search toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          {/* Status filter tabs */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map((f) => {
              const active = filter === f.value
              return (
                <button
                  key={f.label}
                  type="button"
                  className={`filter-pill ${active ? 'active' : ''}`}
                  onClick={() => {
                    setFilter(f.value)
                    setPage(0)
                  }}
                >
                  {f.label}
                </button>
              )
            })}
          </div>

          {/* Search box */}
          <div style={{ minWidth: '240px' }}>
            <input
              type="text"
              placeholder="Search recipient, event or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 14px',
                backgroundColor: '#0f0f11',
                border: '1px solid var(--border-input, #232325)',
                borderRadius: 'var(--radius-full, 9999px)',
                color: '#ffffff',
                fontSize: '12.5px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Content area */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Skeleton variant="table-row" count={5} />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={loadDeliveries} />
        ) : displayedDeliveries.length === 0 ? (
          <EmptyState
            title="No deliveries yet"
            description="Emails sent through the API will appear here."
            style={{ minHeight: '220px' }}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)', color: 'var(--text-muted, #585f73)' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Status</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Recipient</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Event & Subject</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Attempts</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Created</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500, textAlign: 'right' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {displayedDeliveries.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => onSelectDelivery && onSelectDelivery(item)}
                    style={{
                      borderBottom: '1px solid var(--border-subtle, #1f232f)',
                      cursor: 'pointer',
                      transition: 'background-color 0.12s',
                    }}
                  >
                    <td style={{ padding: '12px' }}>{getStatusBadge(item.status)}</td>
                    <td style={{ padding: '12px', color: '#ffffff', fontWeight: 500 }}>
                      {item.recipient_email || '—'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)' }}>
                      <div style={{ fontWeight: 500, color: '#f1f3f9' }}>{item.event_type || 'default'}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted, #585f73)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.rendered_subject || '—'}
                      </div>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)' }}>
                      {item.attempt_count ?? 0}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted, #585f73)', whiteSpace: 'nowrap' }}>
                      {formatRelative(item.created_at)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-action-small"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectDelivery && onSelectDelivery(item)
                        }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Real Pagination footer */}
        {!loading && !error && (deliveries.length > 0 || page > 0) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-subtle, #1f232f)',
              fontSize: '12.5px',
              color: 'var(--text-muted, #585f73)',
            }}
          >
            <div>Page {page + 1}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                style={{ padding: '4px 12px', fontSize: '12px' }}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
                style={{ padding: '4px 12px', fontSize: '12px' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
