import React from 'react'
import { Link } from '../router'
import { useAuth } from '../auth'

export function NotFound() {
  const { user } = useAuth()
  const homePath = user?.role === 'admin' ? '/admin/overview' : '/app/dashboard'

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '32px',
      }}
    >
      <div style={{ fontSize: '48px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
        404
      </div>
      <h1 style={{ fontSize: '20px', marginBottom: '8px' }}>
        Page not found
      </h1>
      <p style={{ maxWidth: '400px', marginBottom: '24px' }}>
        The link you followed might be broken or the page may have been moved.
      </p>
      <Link to={homePath} className="btn btn-primary">
        Return to console
      </Link>
    </div>
  )
}
