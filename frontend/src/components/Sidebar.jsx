import React from 'react'
import { useAuth } from '../auth'
import { Link, useRoute } from '../router'
import { LogoMark } from './LogoMark'

const clientNavItems = [
  {
    name: 'Dashboard',
    path: '/app/dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    name: 'Deliveries',
    path: '/app/deliveries',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
  {
    name: 'Templates',
    path: '/app/templates',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    name: 'Event types',
    path: '/app/event-types',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    name: 'Recipients',
    path: '/app/recipients',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    name: 'Usage',
    path: '/app/usage',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    name: 'API keys',
    path: '/app/api-keys',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7.5" cy="7.5" r="4.5" />
        <path d="m10.7 10.7 9.8 9.8" />
        <path d="m15 17 2-2" />
        <path d="m18 20 2-2" />
      </svg>
    ),
  },
  {
    name: 'Plan',
    path: '/app/plan',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    ),
  },
  {
    name: 'Profile',
    path: '/app/profile',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
]

const adminNavItems = [
  {
    name: 'Overview',
    path: '/admin/overview',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    name: 'Clients',
    path: '/admin/clients',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    name: 'Plans',
    path: '/admin/plans',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    ),
  },
  {
    name: 'System health',
    path: '/admin/health',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    name: 'Audit log',
    path: '/admin/audit-log',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    name: 'Settings',
    path: '/admin/settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

function isItemActive(currentPath, itemPath) {
  if (currentPath === itemPath) return true
  if (itemPath === '/app/dashboard' && (currentPath === '/app' || currentPath === '/app/')) return true
  if (itemPath === '/admin/overview' && (currentPath === '/admin' || currentPath === '/admin/')) return true
  if (itemPath === '/admin/clients' && currentPath.startsWith('/admin/clients/')) return true
  return false
}

export function Sidebar() {
  const { user, client, logout } = useAuth()
  const { path } = useRoute()

  const isAdmin = user?.role === 'admin'
  const navItems = isAdmin ? adminNavItems : clientNavItems
  const roleLabel = isAdmin ? 'Admin console' : 'Client console'

  return (
    <aside
      style={{
        width: 'var(--sidebar-width, 250px)',
        minWidth: 'var(--sidebar-width, 250px)',
        backgroundColor: 'var(--bg-sidebar, #0a0b0e)',
        borderRight: '1px solid var(--border-subtle, #1f232f)',
        height: '100vh',
        position: 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '20px 14px',
        userSelect: 'none',
      }}
    >
      <div>
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 8px 20px 8px' }}>
          <LogoMark size={32} />
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px', color: '#ffffff', letterSpacing: '-0.01em' }}>
              NotifyHub
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #585f73)' }}>
              {roleLabel}
            </div>
          </div>
        </div>

        {/* Navigation links */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {navItems.map((item) => {
            const isActive = isItemActive(path, item.path)
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-full, 9999px)',
                  color: isActive ? '#ffffff' : 'var(--text-secondary, #8c93a7)',
                  backgroundColor: isActive ? 'var(--bg-surface-elevated, #171a23)' : 'transparent',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: '13px',
                  transition: 'all 0.15s ease',
                  border: isActive ? '1px solid var(--border-subtle, #1f232f)' : '1px solid transparent',
                  textDecoration: 'none',
                }}
              >
                <span style={{ color: isActive ? '#ffffff' : 'var(--text-muted, #585f73)', display: 'flex' }}>
                  {item.icon}
                </span>
                <span>{item.name}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      {/* User Card at bottom with Sign out */}
      <div
        style={{
          borderTop: '1px solid var(--border-subtle, #1f232f)',
          paddingTop: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ padding: '0 8px' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name || client?.name || 'User'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted, #585f73)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email}
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="btn-secondary"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
