import React, { useState, useEffect } from 'react';
import { getAuditLogs } from '../../api';

export function AdminAuditLog() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    setLogs(getAuditLogs());
  }, []);

  const filtered = logs.filter(l => {
    if (activeFilter !== 'All' && l.category !== activeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        l.action?.toLowerCase().includes(q) ||
        l.client?.toLowerCase().includes(q) ||
        l.category?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="admin-audit-log">
      <div className="page-header">
        <div className="page-header-text">
          <h1>Audit log</h1>
          <p>Every important action, so you always know who did what.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-secondary" onClick={() => alert('Exporting audit log CSV')}>
            Export
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['All', 'Clients', 'Payments', 'Security'].map(f => (
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
              placeholder="Search activity..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '20%' }}>When</th>
                <th style={{ width: '20%' }}>Who</th>
                <th style={{ width: '35%' }}>Action</th>
                <th style={{ width: '25%' }}>Client</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log, idx) => (
                <tr key={idx}>
                  <td style={{ color: '#8c93a7' }}>{log.when}</td>
                  <td style={{ color: '#fff' }}>{log.who}</td>
                  <td style={{ color: '#fff', fontWeight: 500 }}>{log.action}</td>
                  <td style={{ color: '#cbd5e1' }}>{log.client}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
