import React, { useState, useEffect } from 'react';
import { api, addAuditLog } from '../../api';

export function AdminClients({ onSelectClient }) {
  const [clients, setClients] = useState([]);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientRate, setNewClientRate] = useState(50);
  const [createdClientResult, setCreatedClientResult] = useState(null);

  const fetchClients = async () => {
    const res = await api.getClients();
    if (res.ok && res.data) {
      setClients(res.data.map(c => ({
        ...c,
        email: `${c.name.toLowerCase().replace(/\s+/g, '')}@notifyhub.io`,
        plan: c.rate_limit_per_sec >= 100 ? 'Scale' : (c.rate_limit_per_sec >= 50 ? 'Growth' : 'Starter'),
        usagePct: Math.floor(10 + Math.random() * 40),
      })));
    } else {
      setClients([]);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleToggleStatus = async (client) => {
    const nextStatus = client.status === 'active' ? 'disabled' : 'active';
    const res = await api.updateClientStatus(client.id, nextStatus);
    if (res.ok) {
      addAuditLog({
        action: nextStatus === 'active' ? 'Resumed client service' : 'Paused client service',
        client: client.name,
        category: 'Clients',
      });
      fetchClients();
    } else {
      alert(res.error || 'Failed to update status');
    }
  };

  const handleAddClient = async (e) => {
    e.preventDefault();
    const res = await api.createClient({
      name: newClientName.trim(),
      rate_limit_per_sec: parseFloat(newClientRate),
    });

    if (res.ok) {
      addAuditLog({
        action: 'Provisioned new tenant client',
        client: newClientName.trim(),
        category: 'Clients',
      });
      setCreatedClientResult(res.data);
      fetchClients();
    } else {
      alert(res.error || 'Failed to create client');
    }
  };

  const filteredClients = clients.filter((c) => {
    if (activeFilter === 'Active' && c.status !== 'active') return false;
    if (activeFilter === 'Paused' && c.status !== 'paused' && c.status !== 'disabled') return false;
    if (activeFilter === 'Payment due' && c.status === 'active') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.plan?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <span className="badge badge-green">Active</span>;
      case 'paused':
      case 'disabled':
        return <span className="badge badge-orange">Paused</span>;
      default:
        return <span className="badge badge-gray">{status}</span>;
    }
  };

  const totalClients = clients.length;
  const activeClients = clients.filter(c => c.status === 'active').length;
  const pausedClients = clients.filter(c => c.status !== 'active').length;

  return (
    <div className="admin-clients">
      <div className="page-header">
        <div className="page-header-text">
          <h1>Clients</h1>
          <p>Everyone using NotifyHub, their plans and their status.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-primary" onClick={() => { setCreatedClientResult(null); setShowAddModal(true); }}>
            Add client
          </button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="stat-cards-grid">
        <div className="stat-card">
          <div className="stat-card-label">Total</div>
          <div className="stat-card-value">{totalClients}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Active</div>
          <div className="stat-card-value" style={{ color: 'var(--color-green-text)' }}>
            {activeClients}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Paused</div>
          <div className="stat-card-value" style={{ color: 'var(--color-orange-text)' }}>
            {pausedClients}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Payment status</div>
          <div className="stat-card-value" style={{ color: 'var(--color-green-text)' }}>
            Normal
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['All', 'Active', 'Paused', 'Payment due'].map((f) => (
              <button
                key={f}
                className={`filter-pill ${activeFilter === f ? 'active' : ''}`}
                onClick={() => setActiveFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>

          <div style={{ width: '280px' }}>
            <input
              type="text"
              className="search-input"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '28%' }}>Client</th>
                <th style={{ width: '18%' }}>Plan</th>
                <th style={{ width: '24%' }}>Usage this month</th>
                <th style={{ width: '15%' }}>Status</th>
                <th style={{ width: '15%', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="table-person-cell">
                      <div className="avatar-circle">
                        {(c.name || 'C')[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="person-name">{c.name}</div>
                        <div className="person-email">{c.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: '#fff', fontWeight: 500 }}>
                    {c.plan || 'Growth'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '100px', height: '6px', background: '#202431', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div style={{ width: `${c.usagePct || 50}%`, height: '100%', background: '#ffffff', borderRadius: '9999px' }} />
                      </div>
                      <span style={{ fontSize: '12px', color: '#8c93a7' }}>{c.usagePct || 50}% used</span>
                    </div>
                  </td>
                  <td>{getStatusBadge(c.status)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <button
                        className="btn-action-small"
                        onClick={() => handleToggleStatus(c)}
                      >
                        {c.status === 'active' ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        className="btn-action-small"
                        onClick={() => onSelectClient(c)}
                      >
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Register New Client Tenant</div>
              <button className="modal-close-btn" onClick={() => setShowAddModal(false)}>&times;</button>
            </div>
            {!createdClientResult ? (
              <form onSubmit={handleAddClient}>
                <div className="modal-body">
                  <div className="form-group">
                    <label className="form-label">Client Name</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      placeholder="e.g. Acme Corporation"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Rate Limit (Requests per second)</label>
                    <input
                      type="number"
                      className="form-input"
                      required
                      value={newClientRate}
                      onChange={(e) => setNewClientRate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Create Client
                  </button>
                </div>
              </form>
            ) : (
              <div className="modal-body">
                <div style={{ color: '#10b981', fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>
                  ✓ Client Registered Successfully!
                </div>
                <div className="form-group">
                  <label className="form-label">Client ID</label>
                  <input className="form-input" readOnly value={createdClientResult.id} />
                </div>
                <div className="form-group">
                  <label className="form-label">Raw API Key (Shown only once)</label>
                  <input className="form-input form-textarea-code" readOnly value={createdClientResult.api_key} />
                </div>
                <div className="info-banner">
                  <span>Please copy this API key now. It is hashed with SHA-256 and will never be shown again.</span>
                </div>
                <div className="modal-footer" style={{ marginTop: '16px', padding: 0, background: 'transparent' }}>
                  <button className="btn-primary" onClick={() => setShowAddModal(false)}>
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
