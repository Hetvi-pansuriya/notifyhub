import React, { useState } from 'react';
import { getClientKey, setClientKey, getAdminKey, setAdminKey, DEFAULT_CLIENT_KEY, DEFAULT_ADMIN_KEY } from '../api';

export function KeysModal({ isOpen, onClose, onKeysUpdated }) {
  const [clientKey, setLocalClientKey] = useState(getClientKey());
  const [adminKey, setLocalAdminKey] = useState(getAdminKey());
  const [savedNotice, setSavedNotice] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    setClientKey(clientKey);
    setAdminKey(adminKey);
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
      if (onKeysUpdated) onKeysUpdated();
      onClose();
    }, 800);
  };

  const handleReset = () => {
    setLocalClientKey(DEFAULT_CLIENT_KEY);
    setLocalAdminKey(DEFAULT_ADMIN_KEY);
    setClientKey(DEFAULT_CLIENT_KEY);
    setAdminKey(DEFAULT_ADMIN_KEY);
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
      if (onKeysUpdated) onKeysUpdated();
      onClose();
    }, 800);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">API & Admin Authentication Keys</div>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSave}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Client API Key (X-API-Key)</label>
              <input
                type="text"
                className="form-input form-textarea-code"
                value={clientKey}
                onChange={(e) => setLocalClientKey(e.target.value)}
              />
              <span style={{ fontSize: '11px', color: '#585f73' }}>
                Used for client tenant endpoints (/api/*). Default: FakeShop key.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Admin Master Key (X-Admin-Key)</label>
              <input
                type="text"
                className="form-input form-textarea-code"
                value={adminKey}
                onChange={(e) => setLocalAdminKey(e.target.value)}
              />
              <span style={{ fontSize: '11px', color: '#585f73' }}>
                Used for administrative endpoints (/admin/*).
              </span>
            </div>

            {savedNotice && (
              <div style={{ color: '#10b981', fontSize: '12px', fontWeight: 500 }}>
                ✓ Keys updated in local storage!
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={handleReset} title="Restore seeded keys">
              Reset to Defaults
            </button>
            <button type="submit" className="btn-primary">
              Save Keys
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
