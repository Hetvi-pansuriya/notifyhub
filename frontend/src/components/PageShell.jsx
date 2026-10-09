import React from 'react'

export function PageShell({ title, subtitle, action, children }) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '28px',
          gap: '16px',
        }}
      >
        <div>
          <h1 style={{ marginBottom: '4px' }}>{title}</h1>
          {subtitle && <p style={{ fontSize: '14px' }}>{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
      {children}
    </div>
  )
}

export function ComingNextCard({ message = "This page is coming next" }) {
  return (
    <div
      className="card"
      style={{
        padding: '56px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontSize: '15px',
          fontWeight: 500,
          color: '#ffffff',
          marginBottom: '6px',
        }}
      >
        {message}
      </div>
      <p style={{ fontSize: '13px', maxWidth: '400px' }}>
        This module is part of the next release phase. Core authentication and self-service API keys are fully operational.
      </p>
    </div>
  )
}
