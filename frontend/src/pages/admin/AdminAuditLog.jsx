import React, { useState, useEffect, useCallback } from 'react'
import { request } from '../../api'
import { formatDateTime, formatRelative } from '../../utils/date'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'

export function AdminAuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('All')
  const [clients, setClients] = useState([])
  const [selectedClientId, setSelectedClientId] = useState('')

  const loadClients = useCallback(async () => {
    try {
      const data = await request('/admin/clients')
      setClients(data || [])
    } catch {
      // Non-critical
    }
  }, [])

  const loadAuditLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let url = '/admin/audit-log?limit=100'
      if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`
      if (actionFilter !== 'All') url += `&action=${encodeURIComponent(actionFilter)}`
      if (selectedClientId) url += `&client_id=${encodeURIComponent(selectedClientId)}`

      const data = await request(url)
      setLogs(data || [])
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to load audit logs')
      setLoading(false)
    }
  }, [search, actionFilter, selectedClientId])

  useEffect(() => {
    loadClients()
  }, [loadClients])

  useEffect(() => {
    loadAuditLogs()
  }, [loadAuditLogs])

  const ACTION_OPTIONS = [
    'All',
    'client_signup',
    'client_paused',
    'client_resumed',
    'plan_assigned',
    'admin_reset_keys',
    'key_created',
    'key_revoked',
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
          Platform Audit Log
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted, #585f73)', margin: '4px 0 0 0' }}>
          Immutable event log of security actions, tenant status changes, and administrative overrides
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
        {/* Filter controls row */}
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
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Action filter dropdown */}
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              style={{
                padding: '6px 12px',
                backgroundColor: '#161922',
                border: '1px solid var(--border-subtle, #1f232f)',
                borderRadius: 'var(--radius-full, 9999px)',
                color: '#ffffff',
                fontSize: '12.5px',
                outline: 'none',
              }}
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === 'All' ? 'All Actions' : opt}
                </option>
              ))}
            </select>

            {/* Client filter dropdown */}
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              style={{
                padding: '6px 12px',
                backgroundColor: '#161922',
                border: '1px solid var(--border-subtle, #1f232f)',
                borderRadius: 'var(--radius-full, 9999px)',
                color: '#ffffff',
                fontSize: '12.5px',
                outline: 'none',
              }}
            >
              <option value="">All Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search box */}
          <div style={{ minWidth: '240px' }}>
            <input
              type="text"
              placeholder="Search actor, client, or details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 14px',
                backgroundColor: '#161922',
                border: '1px solid var(--border-subtle, #1f232f)',
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
          <Skeleton variant="table-row" count={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={loadAuditLogs} />
        ) : logs.length === 0 ? (
          <EmptyState
            title="No audit entries found"
            description="No logged platform actions match your filter criteria."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)', color: 'var(--text-muted, #585f73)' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Timestamp</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Actor</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Action</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Client Tenant</th>
                  <th style={{ padding: '10px 12px', fontWeight: 500 }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border-subtle, #1f232f)' }}>
                    <td style={{ padding: '12px', color: 'var(--text-muted, #585f73)', whiteSpace: 'nowrap' }}>
                      {formatDateTime(log.created_at || log.at)}
                    </td>
                    <td style={{ padding: '12px', color: '#ffffff', fontWeight: 500 }}>
                      {log.actor_email}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span className="badge badge-gray" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary, #8c93a7)' }}>
                      {log.client_name || log.client_id || '—'}
                    </td>
                    <td style={{ padding: '12px', color: '#f1f3f9' }}>
                      <span style={{ maxWidth: '380px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.detail || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
