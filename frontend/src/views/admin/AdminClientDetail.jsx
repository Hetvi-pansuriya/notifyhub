import React, { useState, useEffect } from 'react';
import { api, addAuditLog } from '../../api';
import { DailyBarChart } from '../../components/Charts';

export function AdminClientDetail({ client, onBack }) {
  const [activeTab, setActiveTab] = useState('Overview');
  const [targetClient, setTargetClient] = useState(client || null);
  const [status, setStatus] = useState(client?.status || 'active');
  const [rotatedKey, setRotatedKey] = useState(null);
  const [clientMetrics, setClientMetrics] = useState({
    sent: 0,
    dead: 0,
    queued: 0,
  });

  useEffect(() => {
    async function loadData() {
      let c = client;
      if (!c) {
        const res = await api.getClients();
        if (res.ok && res.data && res.data.length > 0) {
          c = res.data[0];
          setTargetClient(c);
          setStatus(c.status);
        }
      }

      if (c?.id) {
        const mRes = await api.getAdminMetrics(c.id);
        if (mRes.ok && mRes.data) {
          const counts = mRes.data.status_counts || {};
          setClientMetrics({
            sent: counts.sent || 0,
            dead: counts.dead || 0,
            queued: counts.queued || 0,
          });
        }
      }
    }
    loadData();
  }, [client]);

  const dailyData = [
    { value: 0 }, { value: 0 }, { value: 0 }, { value: 0 },
    { value: 1 }, { value: 2 }, { value: clientMetrics.sent },
  ];

  const recentPayments = [
    { date: '1 Oct 2026', plan: `${targetClient?.rate_limit_per_sec || 50}/s Tier`, amount: '₹4,999', status: 'Paid' },
    { date: '1 Sep 2026', plan: `${targetClient?.rate_limit_per_sec || 50}/s Tier`, amount: '₹4,999', status: 'Paid' },
  ];

  const handleToggleService = async () => {
    if (!targetClient) return;
    const nextStatus = status === 'active' ? 'disabled' : 'active';
    const res = await api.updateClientStatus(targetClient.id, nextStatus);
    if (res.ok) {
      setStatus(nextStatus);
      addAuditLog({
        action: nextStatus === 'active' ? 'Resumed service' : 'Paused service',
        client: targetClient.name,
        category: 'Clients',
      });
    } else {
      alert(res.error || 'Failed to update client status');
    }
  };

  const handleResetKey = async () => {
    if (!targetClient) return;
    if (window.confirm('Are you sure you want to rotate this client API key? The old key will immediately stop working.')) {
      const res = await api.rotateClientKey(targetClient.id);
      if (res.ok) {
        setRotatedKey(res.data?.api_key);
        addAuditLog({
          action: 'Rotated API key',
          client: targetClient.name,
          category: 'Security',
        });
        alert('Key rotated successfully! New key revealed.');
      } else {
        alert(res.error || 'Failed to rotate key');
      }
    }
  };

  if (!targetClient) {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: '#8c93a7' }}>No client selected.</p>
        <button className="btn-secondary" onClick={onBack} style={{ marginTop: '12px' }}>
          Back to Clients
        </button>
      </div>
    );
  }

  return (
    <div className="admin-client-detail">
      {/* Top back button */}
      <div style={{ marginBottom: '14px' }}>
        <button
          className="btn-secondary"
          style={{ fontSize: '12px', padding: '4px 12px' }}
          onClick={onBack}
        >
          ← Back to Clients
        </button>
      </div>

      {/* Header */}
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div className="page-header-text">
          <h1>{targetClient.name}</h1>
          <p>{targetClient.email} · client since 12 Mar 2026</p>
        </div>
        <div className="page-header-actions">
          <span className={`badge ${status === 'active' ? 'badge-green' : 'badge-orange'}`} style={{ textTransform: 'capitalize' }}>
            {status}
          </span>
        </div>
      </div>

      {/* Sub tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {['Overview', 'Usage', 'Payments', 'Activity'].map((t) => (
          <button
            key={t}
            className={`filter-pill ${activeTab === t ? 'active' : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 4 Stat Cards */}
      <div className="stat-cards-grid">
        <div className="stat-card">
          <div className="stat-card-label">Plan</div>
          <div className="stat-card-value">{targetClient.plan || 'Growth'}</div>
          <div className="stat-card-desc">renews 1 Nov 2026</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Emails sent</div>
          <div className="stat-card-value">{clientMetrics.sent.toLocaleString()}</div>
          <div className="stat-card-desc">delivered to queue</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Rate limit</div>
          <div className="stat-card-value">{targetClient.rate_limit_per_sec || 50}/s</div>
          <div className="stat-card-desc">tier speed limit</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Failed / Dead</div>
          <div className="stat-card-value" style={{ color: clientMetrics.dead > 0 ? 'var(--color-red-text)' : 'var(--color-green-text)' }}>
            {clientMetrics.dead}
          </div>
          <div className="stat-card-desc">exhausted deliveries</div>
        </div>
      </div>

      {/* Middle row: Emails per day & Service control */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '20px', marginBottom: '24px' }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div className="card-title">Emails per day</div>
          </div>
          <DailyBarChart data={dailyData} height={190} />
        </div>

        {/* Service control */}
        <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="card-header">
              <div className="card-title">Service control</div>
            </div>
            <p style={{ fontSize: '13px', color: '#8c93a7', lineHeight: 1.6, marginBottom: '18px' }}>
              Pausing stops new emails from being accepted. Emails already queued keep going.
            </p>

            {rotatedKey && (
              <div style={{ background: '#161922', padding: '10px', borderRadius: '8px', border: '1px solid #10b981', marginBottom: '14px', fontSize: '12px' }}>
                <div style={{ color: '#10b981', fontWeight: 600 }}>New API Key:</div>
                <div style={{ wordBreak: 'break-all', fontFamily: 'var(--font-mono)', color: '#fff', marginTop: '4px' }}>
                  {rotatedKey}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button className="btn-primary" style={{ width: '100%' }} onClick={handleToggleService}>
              {status === 'active' ? 'Pause service' : 'Resume service'}
            </button>
            <button className="btn-secondary" style={{ width: '100%' }} onClick={() => alert('Plan change modal')}>
              Change plan
            </button>
            <button className="btn-secondary" style={{ width: '100%' }} onClick={handleResetKey}>
              Reset API key
            </button>
          </div>
        </div>
      </div>

      {/* Recent payments */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent payments</div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {recentPayments.map((p, idx) => (
                <tr key={idx}>
                  <td style={{ color: '#fff' }}>{p.date}</td>
                  <td>{p.plan}</td>
                  <td style={{ color: '#fff' }}>{p.amount}</td>
                  <td><span className="badge badge-green">{p.status}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-action-small" onClick={() => alert(`Receipt downloaded for ${p.date}`)}>
                      Receipt
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
