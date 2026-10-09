import React, { useState } from 'react';
import { getAdminKey, setAdminKey, addAuditLog } from '../../api';

export function AdminSettings() {
  const [reqPerSec, setReqPerSec] = useState('50');
  const [sendingSpeed, setSendingSpeed] = useState('20');
  const [retrySchedule, setRetrySchedule] = useState('5s, 10s, 20s, 40s');
  const [smtpHost, setSmtpHost] = useState('mailhog');
  const [smtpPort, setSmtpPort] = useState('1025');
  const [smtpFrom, setSmtpFrom] = useState('no-reply@notifyhub.local');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    addAuditLog({
      action: 'Updated platform default settings',
      client: 'Platform',
      category: 'System',
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleRotateAdminKey = () => {
    if (window.confirm('Rotate master admin key?')) {
      const newKey = `admin_secret_${Math.random().toString(36).substring(2, 12)}`;
      setAdminKey(newKey);
      addAuditLog({
        action: 'Rotated master admin key',
        client: 'Platform Master',
        category: 'Security',
      });
      alert(`New master admin key generated: ${newKey}`);
    }
  };

  return (
    <div className="admin-settings">
      <div className="page-header">
        <div className="page-header-text">
          <h1>Settings</h1>
          <p>Defaults and safety settings for the whole platform.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-primary" onClick={handleSave}>
            Save changes
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="info-banner" style={{ borderLeft: '3px solid #10b981', color: '#10b981', marginBottom: '20px' }}>
          <span>✓ Settings saved successfully.</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Defaults for new clients */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div className="card-title">Defaults for new clients</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Requests per second</label>
              <input
                type="text"
                className="form-input"
                value={reqPerSec}
                onChange={(e) => setReqPerSec(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Sending speed (emails per second)</label>
              <input
                type="text"
                className="form-input"
                value={sendingSpeed}
                onChange={(e) => setSendingSpeed(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Retry after</label>
              <input
                type="text"
                className="form-input"
                value={retrySchedule}
                onChange={(e) => setRetrySchedule(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Mail server */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div className="card-title">Mail server</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Host</label>
              <input
                type="text"
                className="form-input"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Port</label>
              <input
                type="text"
                className="form-input"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">From address</label>
              <input
                type="text"
                className="form-input"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Admin key */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div className="card-title">Admin key</div>
          </div>
          <p style={{ fontSize: '13px', color: '#8c93a7', marginBottom: '16px' }}>
            Rotating it signs out everyone using the old one.
          </p>
          <div>
            <button className="btn-secondary" onClick={handleRotateAdminKey}>
              Rotate admin key
            </button>
          </div>
        </div>

        {/* Maintenance mode */}
        <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="card-header" style={{ marginBottom: '8px' }}>
              <div className="card-title">Maintenance mode</div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={maintenanceMode}
                  onChange={() => setMaintenanceMode(!maintenanceMode)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <p style={{ fontSize: '13px', color: '#8c93a7' }}>
              Pause all new emails while you work.
            </p>
          </div>

          {maintenanceMode && (
            <div style={{ color: '#f59e0b', fontSize: '12px', marginTop: '14px' }}>
              ⚠️ Maintenance mode is currently ON.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
