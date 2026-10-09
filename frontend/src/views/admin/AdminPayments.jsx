import React, { useState } from 'react';

export function AdminPayments() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const receipts = [
    { id: 'rcpt_0412', client: 'FakeShop', date: '1 Oct 2026', amount: '₹4,999', status: 'Paid' },
    { id: 'rcpt_0411', client: 'Acme Mail', date: '1 Oct 2026', amount: '₹14,999', status: 'Paid' },
    { id: 'rcpt_0410', client: 'Old Store', date: '1 Oct 2026', amount: '₹1,999', status: 'Failed' },
    { id: 'rcpt_0409', client: 'Tiny Blog', date: '1 Sep 2026', amount: '₹1,999', status: 'Paid' },
    { id: 'rcpt_0408', client: 'FakeShop', date: '1 Sep 2026', amount: '₹4,999', status: 'Paid' },
  ];

  const filtered = receipts.filter(r => {
    if (activeFilter !== 'All' && r.status !== activeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return r.id.toLowerCase().includes(q) || r.client.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="admin-payments">
      <div className="page-header">
        <div className="page-header-text">
          <h1>Payments</h1>
          <p>Receipts and billing for every client.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-secondary" onClick={() => alert('Exporting all payment receipts')}>
            Export all
          </button>
        </div>
      </div>

      {/* 3 Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 1fr', gap: '18px', marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-card-label">Collected this month</div>
          <div className="stat-card-value" style={{ color: 'var(--color-green-text)' }}>
            ₹1,18,000
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Waiting</div>
          <div className="stat-card-value" style={{ color: 'var(--color-orange-text)' }}>
            ₹14,999
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Failed</div>
          <div className="stat-card-value" style={{ color: 'var(--color-red-text)' }}>
            1
          </div>
          <div className="stat-card-desc">Old Store</div>
        </div>
      </div>

      {/* Table Card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['All', 'Paid', 'Pending', 'Failed', 'Refunded'].map(f => (
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
              placeholder="Search receipts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Client</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>{r.id}</td>
                  <td style={{ color: '#fff', fontWeight: 500 }}>{r.client}</td>
                  <td>{r.date}</td>
                  <td style={{ color: '#fff' }}>{r.amount}</td>
                  <td>
                    <span className={`badge ${r.status === 'Paid' ? 'badge-green' : 'badge-red'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-action-small" onClick={() => alert(`Downloading receipt ${r.id}`)}>
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
