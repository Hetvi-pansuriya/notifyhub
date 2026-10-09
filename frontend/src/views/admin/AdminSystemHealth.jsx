import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { SparklineChart } from '../../components/Charts';

export function AdminSystemHealth() {
  const [healthInfo, setHealthInfo] = useState({
    queueDepth: 0,
    workers: 2,
    mailServer: 'Healthy',
    deadEmails: 0,
    dbStatus: 'connected',
  });

  const queuePoints = [
    { time: '00:00', value: 0 },
    { time: '06:00', value: 0 },
    { time: '12:00', value: 0 },
    { time: 'now', value: healthInfo.queueDepth },
  ];

  useEffect(() => {
    async function loadHealth() {
      const hRes = await api.getHealth();
      const mRes = await api.getAdminMetrics();

      if (hRes.ok && hRes.data) {
        setHealthInfo(prev => ({
          ...prev,
          dbStatus: hRes.data.database === 'connected' ? 'connected' : 'unhealthy',
        }));
      }

      if (mRes.ok && mRes.data) {
        const counts = mRes.data.status_counts || {};
        setHealthInfo(prev => ({
          ...prev,
          queueDepth: mRes.data.queue_depth || 0,
          deadEmails: counts.dead || 0,
        }));
      }
    }
    loadHealth();
  }, []);

  return (
    <div className="admin-system-health">
      <div className="page-header">
        <div className="page-header-text">
          <h1>System health</h1>
          <p>Is everything behind the scenes working?</p>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="stat-cards-grid">
        <div className="stat-card">
          <div className="stat-card-label">Queue depth</div>
          <div className="stat-card-value" style={{ color: 'var(--color-orange-text)' }}>
            {healthInfo.queueDepth}
          </div>
          <div className="stat-card-desc">emails waiting</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Workers</div>
          <div className="stat-card-value" style={{ color: 'var(--color-green-text)' }}>
            {healthInfo.workers}
          </div>
          <div className="stat-card-desc">both running</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Mail server</div>
          <div className="stat-card-value" style={{ color: 'var(--color-green-text)' }}>
            {healthInfo.mailServer}
          </div>
          <div className="stat-card-desc">last send 1s ago</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Dead emails</div>
          <div className="stat-card-value" style={{ color: 'var(--color-red-text)' }}>
            {healthInfo.deadEmails}
          </div>
          <div className="stat-card-desc">across platform tenants</div>
        </div>
      </div>

      {/* Grid: Queue size chart & Background jobs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '20px' }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div className="card-title">Queue size today</div>
          </div>
          <SparklineChart data={queuePoints} height={210} unit="waiting" />
        </div>

        {/* Background jobs card */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div className="card-title">Background jobs</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1a1e2a', paddingBottom: '12px' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '13.5px' }}>Email worker</div>
                <div style={{ fontSize: '12px', color: '#8c93a7', marginTop: '2px' }}>picking up every 1s</div>
              </div>
              <span className="badge badge-green">Running</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1a1e2a', paddingBottom: '12px' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '13.5px' }}>Recovery job</div>
                <div style={{ fontSize: '12px', color: '#8c93a7', marginTop: '2px' }}>last run 12s ago</div>
              </div>
              <span className="badge badge-green">Running</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '13.5px' }}>Database</div>
                <div style={{ fontSize: '12px', color: '#8c93a7', marginTop: '2px' }}>{healthInfo.dbStatus}</div>
              </div>
              <span className="badge badge-green">Running</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
