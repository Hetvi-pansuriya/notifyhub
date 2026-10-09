import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export function ClientDeliveries({ onSelectDelivery }) {
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDeliveries = async () => {
    setLoading(true);
    let statusParam = null;
    if (activeFilter === 'Failed') statusParam = 'dead';
    else if (activeFilter !== 'All') statusParam = activeFilter.toLowerCase();

    const res = await api.getDeliveries({ status: statusParam, limit: 50 });
    if (res.ok && res.data) {
      setDeliveries(res.data.items || []);
    } else {
      setDeliveries([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDeliveries();
  }, [activeFilter]);

  const handleRetry = async (deliveryId) => {
    const res = await api.retryDelivery(deliveryId);
    if (res.ok) {
      alert('Delivery re-queued successfully!');
      fetchDeliveries();
    } else {
      alert(res.error || 'Retry rejected');
    }
  };

  const filteredItems = deliveries.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.to_email?.toLowerCase().includes(q) ||
      d.id?.toLowerCase().includes(q) ||
      d.event_type?.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status) => {
    const s = status?.toLowerCase();
    switch (s) {
      case 'sent':
        return (
          <span
            className="badge badge-green"
            title="Sent means our mail provider accepted it. It can still take a moment to reach the inbox."
            style={{ cursor: 'help' }}
          >
            Sent ℹ
          </span>
        );
      case 'queued':
        return <span className="badge badge-orange">Queued</span>;
      case 'dead':
      case 'failed':
        return <span className="badge badge-red">Failed</span>;
      case 'skipped':
        return <span className="badge badge-gray">Skipped</span>;
      case 'expired':
        return <span className="badge badge-gray" style={{ background: '#251e33', color: '#c084fc' }}>Expired</span>;
      default:
        return <span className="badge badge-gray">{status}</span>;
    }
  };

  const getRelativeTime = (isoString) => {
    if (!isoString) return 'recently';
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} hr ago`;
    return `${Math.floor(diffHours / 24)} d ago`;
  };

  return (
    <div className="client-deliveries">
      <div className="page-header">
        <div className="page-header-text">
          <h1>Deliveries</h1>
          <p>Every email you asked us to send, and what happened to it.</p>
        </div>
      </div>

      <div className="card">
        {/* Controls row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['All', 'Queued', 'Sent', 'Failed', 'Skipped', 'Expired'].map((filter) => (
              <button
                key={filter}
                className={`filter-pill ${activeFilter === filter ? 'active' : ''}`}
                onClick={() => setActiveFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>

          <div style={{ width: '280px' }}>
            <input
              type="text"
              className="search-input"
              placeholder="Search by email or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Deliveries Table */}
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Event</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>When</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td style={{ color: '#fff', fontWeight: 500 }}>
                    {item.to_email}
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#cbd5e1' }}>
                      {item.event_type || 'order_shipped'}
                    </span>
                  </td>
                  <td>{getStatusBadge(item.status)}</td>
                  <td>{item.attempt_count ?? 1}</td>
                  <td style={{ color: '#8c93a7' }}>
                    {getRelativeTime(item.created_at)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {item.status?.toLowerCase() === 'dead' ? (
                      <button
                        className="btn-action-small"
                        onClick={() => handleRetry(item.id)}
                      >
                        Send again
                      </button>
                    ) : (
                      <button
                        className="btn-action-small"
                        onClick={() => onSelectDelivery(item)}
                      >
                        View
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#8c93a7' }}>
                    No deliveries found. Use "+ Send Event" in the top bar to dispatch an event!
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#8c93a7' }}>
                    Loading deliveries from database...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '16px', fontSize: '12px', color: '#8c93a7', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#4ade80', fontSize: '14px' }}>ℹ</span>
          <span>Sent means our mail provider accepted it. It can still take a moment to reach the inbox.</span>
        </div>
      </div>
    </div>
  );
}
