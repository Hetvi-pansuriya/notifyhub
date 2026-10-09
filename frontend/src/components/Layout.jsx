import React from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './TopBar'

export function Layout({ children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', backgroundColor: 'var(--bg-root, #0a0b0e)' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar />
        <main style={{ flex: 1, padding: '32px', maxWidth: '1240px', width: '100%', margin: '0 auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
