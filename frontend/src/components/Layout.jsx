import React from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function Layout({ children, onOpenSendEventModal }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar onOpenSendEventModal={onOpenSendEventModal} />
        <main style={{ flex: 1, padding: '32px', maxWidth: '1240px', width: '100%', margin: '0 auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
