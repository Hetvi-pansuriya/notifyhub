import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export function ClientRecipients() {
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);

  // Form states
  const [externalId, setExternalId] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [optOutEventType, setOptOutEventType] = useState('order_shipped');
  const [optOutEnabled, setOptOutEnabled] = useState(false); // false = opt-out

  const fetchRecipients = async () => {
    setLoading(true);
    const res = await api.getRecipients();
    if (res.ok && res.data) {
      setRecipients(res.data);
    } else {
      setRecipients([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRecipients();
  }, []);

  const openAddModal = () => {
    setEditItem(null);
    setExternalId(`cust_${Math.floor(1000 + Math.random() * 9000)}`);
    setEmail('');
    setName('');
    setShowModal(true);
  };

  const openEditModal = (r) => {
    setEditItem(r);
    setExternalId(r.external_id);
    setEmail(r.email);
    setName(r.name || '');
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const res = await api.upsertRecipient(externalId.trim(), {
      email: email.trim(),
      name: name.trim() || undefined,
    });

    if (res.ok) {
      // If setting an opt-out preference
      if (editItem && optOutEventType) {
        await api.updateRecipientPreference(externalId.trim(), optOutEventType, optOutEnabled);
      }
      setShowModal(false);
      fetchRecipients();
      alert('Recipient saved successfully!');
    } else {
      alert(res.error || 'Failed to save recipient');
    }
  };

  const filteredRecipients = recipients.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.email?.toLowerCase().includes(q) ||
      r.name?.toLowerCase().includes(q) ||
      r.external_id?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="client-recipients">
      <div className="page-header">
        <div className="page-header-text">
          <h1>Recipients</h1>
          <p>The people you email, and what they have chosen not to receive.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-primary" onClick={openAddModal}>
            Add recipient
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ width: '320px', marginBottom: '20px' }}>
          <input
            type="text"
            className="search-input"
            placeholder="Search recipients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '35%' }}>Person</th>
                <th style={{ width: '25%' }}>Your ID</th>
                <th style={{ width: '28%' }}>Opted out of</th>
                <th style={{ width: '12%', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredRecipients.map((r) => (
                <tr key={r.id || r.external_id}>
                  <td>
                    <div className="table-person-cell">
                      <div className="avatar-circle">
                        {(r.name || r.email || 'U')[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="person-name">{r.name || r.email.split('@')[0]}</div>
                        <div className="person-email">{r.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                    {r.external_id}
                  </td>
                  <td>
                    {r.opt_outs && r.opt_outs.length > 0 ? (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {r.opt_outs.map((type) => (
                          <span
                            key={type}
                            className="badge badge-gray"
                            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: '#191d27', color: '#cbd5e1' }}
                          >
                            {type}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: '#8c93a7', fontSize: '12.5px' }}>Receives everything</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-action-small" onClick={() => openEditModal(r)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filteredRecipients.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '36px', color: '#8c93a7' }}>
                    No recipients in database yet. Click "Add recipient" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Recipient Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editItem ? 'Edit Recipient' : 'Add Recipient'}</div>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">External Customer ID</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    readOnly={!!editItem}
                    value={externalId}
                    onChange={(e) => setExternalId(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Full Name (optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Aarav Mehta"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                {editItem && (
                  <div style={{ background: '#161922', padding: '14px', borderRadius: '10px', border: '1px solid #232733' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>
                      Opt-Out Preference Management
                    </div>
                    <div className="form-group">
                      <label className="form-label">Event Type</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. order_shipped"
                        value={optOutEventType}
                        onChange={(e) => setOptOutEventType(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
                      <span className="form-label">Opt-In Status</span>
                      <select
                        className="form-input"
                        style={{ width: '140px' }}
                        value={optOutEnabled ? 'true' : 'false'}
                        onChange={(e) => setOptOutEnabled(e.target.value === 'true')}
                      >
                        <option value="false">Opted Out (Block)</option>
                        <option value="true">Opted In (Allow)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Recipient
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
