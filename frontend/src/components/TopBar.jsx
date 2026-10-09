import React from 'react'
import { useAuth } from '../auth'

export function Topbar({ onOpenSendEventModal }) {
  const { user } = useAuth()
  const initial = user?.name ? user.name[0].toUpperCase() : (user?.email ? user.email[0].toUpperCase() : 'U')
  const isClient = user?.role !== 'admin'

  return (
    <header
      style={{
        height: 'var(--topbar-height)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        backgroundColor: 'var(--color-page)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Search box */}
      <div style={{ position: 'relative', width: '280px' }}>
        <input
          type="text"
          placeholder="Search..."
          style={{
            width: '100%',
            padding: '8px 16px 8px 36px',
            backgroundColor: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-pill)',
            color: 'var(--color-text)',
            fontSize: '13px',
            fontFamily: 'var(--font-family)',
            outline: 'none',
          }}
        />
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {isClient && onOpenSendEventModal && (
          <button
            className="btn btn-primary btn-sm"
            onClick={onOpenSendEventModal}
            style={{ fontWeight: 600 }}
          >
            + Send Event
          </button>
        )}

        {/* Status indicator pill */}
        <div className="status-pill status-green">
          All systems running
        </div>

        {/* User avatar circle */}
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
            fontWeight: 600,
            color: '#ffffff',
          }}
          title={user?.email || 'User'}
        >
          {initial}
        </div>
      </div>
    </header>
  )
}
