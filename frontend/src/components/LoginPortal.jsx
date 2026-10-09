import React, { useState } from 'react';
import { api, DEFAULT_CLIENT_KEY, DEFAULT_ADMIN_KEY } from '../api';

export function LoginPortal({ onLoginSuccess }) {
  const [selectedRole, setSelectedRole] = useState('client'); // 'client' | 'admin'
  const [keyInput, setKeyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handlePreFill = () => {
    if (selectedRole === 'client') {
      setKeyInput(DEFAULT_CLIENT_KEY);
    } else {
      setKeyInput(DEFAULT_ADMIN_KEY);
    }
    setErrorMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!keyInput.trim()) {
      setErrorMessage('Please enter an authentication key');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    if (selectedRole === 'client') {
      const res = await api.validateAndLoginClient(keyInput.trim());
      setLoading(false);
      if (res.ok) {
        onLoginSuccess('client', res.client);
      } else {
        setErrorMessage(res.error || 'Invalid Client API Key');
      }
    } else {
      const res = await api.validateAndLoginAdmin(keyInput.trim());
      setLoading(false);
      if (res.ok) {
        onLoginSuccess('admin', null);
      } else {
        setErrorMessage(res.error || 'Invalid Admin Master Key');
      }
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0a0b0e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          background: '#12141a',
          border: '1px solid #1f232f',
          borderRadius: '20px',
          padding: '36px 32px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7)',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              background: '#ffffff',
              color: '#0c0d12',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.3px' }}>NotifyHub</div>
            <div style={{ fontSize: '12px', color: '#687084' }}>High-Reliability Notification Engine</div>
          </div>
        </div>

        <div style={{ marginBottom: '22px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>Sign in to Console</h2>
          <p style={{ fontSize: '13px', color: '#8c93a7' }}>Select your portal access role and enter your key.</p>
        </div>

        {/* Role Selector Tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            background: '#161922',
            padding: '4px',
            borderRadius: '9999px',
            border: '1px solid #232838',
            marginBottom: '24px',
          }}
        >
          <button
            type="button"
            className={`filter-pill ${selectedRole === 'client' ? 'active' : ''}`}
            style={{ border: 'none', textAlign: 'center', padding: '8px' }}
            onClick={() => {
              setSelectedRole('client');
              setKeyInput('');
              setErrorMessage('');
            }}
          >
            Client Console
          </button>
          <button
            type="button"
            className={`filter-pill ${selectedRole === 'admin' ? 'active' : ''}`}
            style={{ border: 'none', textAlign: 'center', padding: '8px' }}
            onClick={() => {
              setSelectedRole('admin');
              setKeyInput('');
              setErrorMessage('');
            }}
          >
            Admin Console
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label">
                {selectedRole === 'client' ? 'Client API Key (X-API-Key)' : 'Master Admin Key (X-Admin-Key)'}
              </label>
              <button
                type="button"
                onClick={handlePreFill}
                style={{ fontSize: '11.5px', color: '#60a5fa', textDecoration: 'underline' }}
              >
                Use Demo Key
              </button>
            </div>
            <input
              type="password"
              className="form-input form-textarea-code"
              placeholder={selectedRole === 'client' ? 'nh_live_...' : 'admin_master_...'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              required
            />
          </div>

          {errorMessage && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                color: '#f87171',
                marginBottom: '18px',
              }}
            >
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', padding: '10px' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : `Enter ${selectedRole === 'client' ? 'Client' : 'Admin'} Console →`}
          </button>
        </form>

        <div style={{ marginTop: '22px', borderTop: '1px solid #1a1e2b', paddingTop: '16px', fontSize: '11.5px', color: '#585f73', textAlign: 'center' }}>
          Role-Based Access Control: Clients are isolated to tenant data. Admins manage platform health and tenants.
        </div>
      </div>
    </div>
  );
}
