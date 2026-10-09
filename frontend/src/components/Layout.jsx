import React, { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './TopBar'
import { useAuth } from '../auth'
import { request } from '../api'

export function Layout({ children }) {
  const { user } = useAuth()
  const [maintenanceMode, setMaintenanceMode] = useState(false)

  const checkStatus = useCallback(async () => {
    try {
      const res = await request('/api/system/status')
      setMaintenanceMode(Boolean(res?.maintenance_mode))
    } catch {
      // ignore network errors
    }
  }, [])

  useEffect(() => {
    checkStatus()
    const timer = setInterval(checkStatus, 10000)
    return () => clearInterval(timer)
  }, [checkStatus])

  const isClient = user?.role !== 'admin'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', backgroundColor: 'var(--bg-root, #0a0b0e)' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar />

        {/* Maintenance Mode Banner below Topbar with #F59E0B background */}
        {maintenanceMode && isClient && (
          <div
            style={{
              backgroundColor: '#F59E0B',
              color: '#0a0d14',
              padding: '12px 32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              fontSize: '13.5px',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              boxShadow: '0 2px 10px rgba(245, 158, 11, 0.25)',
              zIndex: 10,
            }}
          >
            <span style={{ fontSize: '16px' }}>⚠️</span>
            <span>
              <strong>Platform Maintenance Active:</strong> System maintenance is currently underway. Email queueing and deliveries are temporarily paused.
            </span>
          </div>
        )}

        <main style={{ flex: 1, padding: '32px', maxWidth: '1240px', width: '100%', margin: '0 auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
