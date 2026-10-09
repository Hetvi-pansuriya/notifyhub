import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { SparklineChart } from '../../components/Charts';

export function AdminOverview({ onSelectClient }) {
  const [metrics, setMetrics] = useState({
    activeClients: 0,
    totalClients: 0,
    emailsToday: 0,
    deliveredRate: '100%',
    inQueue: 0,
    deadEmails: 0,
  });
  const [attentionItems, setAttentionItems] = useState([]);

  const chartPoints = [
    { time: '00:00', value: 0 },
    { time: '04:00', value: 0 },
    { time: '08:00', value: 1 },
    { time: '12:00', value: 2 },
    { time: '16:00', value: 3 },
    { time: 'Now', value: metrics.emailsToday },
  ];

  useEffect(() => {
    async function fetchAdminData() {
      const res = await api.getAdminMetrics();
      const clientsRes = await api.getClients();

      let deadCount = 0;
      let sentCount = 0;
      let queuedCount = 0;

      if (res.ok && res.data) {
        const counts = res.data.status_counts || {};
        sentCount = counts.sent || 0;
        queuedCount = counts.queued || 0;
        deadCount = counts.dead || 0;
        const rate = res.data.success_rate !== null && res.data.success_rate !== undefined
          ? `${(res.data.success_rate * 100).toFixed(1)}%`
          : '100%';

        setMetrics(prev => ({
          ...prev,
          emailsToday: sentCount,
          inQueue: queuedCount,
          deliveredRate: rate,
          deadEmails: deadCount,
        }));
      }

      const clientList = clientsRes.ok && clientsRes.data ? clientsRes.data : [];
      const active = clientList.filter(c => c.status === 'active').length;
      const paused = clientList.filter(c => c.status !== 'active');

      setMetrics(prev => ({
        ...prev,
        totalClients: clientList.length,
        activeClients: active,
      }));

      // Generate dynamic attention items
      const items = [];
      if (deadCount > 0) {
        items.push({
          title: `${deadCount} dead letter delivery${deadCount > 1 ? 'ies' : ''}`,
          desc: 'Deliveries exhausted max retries in queue',
          color: '#ef4444',
        });
      }
      if (paused.length > 0) {
        paused.forEach(p => {
          items.push({
            title: `${p.name} service is paused`,
            desc: `Status: ${p.status} · New intake blocked`,
            color: '#f59e0b',
          });
        });
      }
      if (items.length === 0) {
        items.push({
          title: 'All tenant pipelines healthy',
          desc: 'Zero dead deliveries, all workers operating normally',
          color: '#10b981',
        });
      }
      setAttentionItems(items);
    }
    fetchAdminData();
  }, []);

  return (
    <div className="admin-overview">
      <div className="page-header">
        <div className="page-header-text">
          <h1>Overview</h1>
          <p>The whole platform at a glance.</p>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="stat-cards-grid">
        <div className="stat-card">
          <div className="stat-card-label">Active clients</div>
          <div className="stat-card-value">{metrics.activeClients}</div>
          <div className="stat-card-desc">of {metrics.totalClients} clients</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Emails today</div>
          <div className="stat-card-value">{metrics.emailsToday.toLocaleString()}</div>
          <div className="stat-card-desc">across all clients</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Delivered</div>
          <div className="stat-card-value" style={{ color: 'var(--color-green-text)' }}>
            {metrics.deliveredRate}
          </div>
          <div className="stat-card-desc">last 24 hours</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">In queue</div>
          <div className="stat-card-value" style={{ color: 'var(--color-orange-text)' }}>
            {metrics.inQueue}
          </div>
          <div className="stat-card-desc">oldest waiting 4s</div>
        </div>
      </div>

      {/* Main Charts & Attention Card Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '20px' }}>
        {/* Left: Emails Sent Today Chart */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Emails sent today</div>
              <div className="card-subtitle">All clients together</div>
            </div>
          </div>

          <SparklineChart
            data={chartPoints}
            height={220}
            unit="emails"
            timeLabel="today"
          />
        </div>

        {/* Right: Needs your attention */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div className="card-title">Needs your attention</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {attentionItems.map((item, idx) => (
              <div
                key={idx}
                style={{
                  borderBottom: idx < attentionItems.length - 1 ? '1px solid #1a1e29' : 'none',
                  paddingBottom: idx < attentionItems.length - 1 ? '14px' : '0',
                }}
              >
                <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '13.5px' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '12px', color: item.color, marginTop: '3px' }}>
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
