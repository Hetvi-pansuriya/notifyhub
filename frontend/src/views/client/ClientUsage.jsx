import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { DailyBarChart, RateLimitChart } from '../../components/Charts';

export function ClientUsage({ onNavigateToPlans }) {
  const [timeFilter, setTimeFilter] = useState('Last month');
  const [loading, setLoading] = useState(true);
  const [clientInfo, setClientInfo] = useState(null);
  const [metrics, setMetrics] = useState({
    sent: 0,
    queued: 0,
    dead: 0,
    successRate: '100%',
  });
  const [dailyData, setDailyData] = useState([]);
  const [rateLimitData, setRateLimitData] = useState([]);

  useEffect(() => {
    async function loadUsage() {
      setLoading(true);
      const [meRes, mRes, dRes] = await Promise.all([
        api.getMe(),
        api.getClientMetrics(),
        api.getDeliveries({ limit: 100 }),
      ]);

      const client = meRes.ok && meRes.data ? meRes.data : { rate_limit_per_sec: 50 };
      setClientInfo(client);

      if (mRes.ok && mRes.data) {
        const counts = mRes.data.status_counts || {};
        const sent = counts.sent || 0;
        const rate = mRes.data.success_rate !== undefined ? `${(mRes.data.success_rate * 100).toFixed(1)}%` : '100%';
        setMetrics({
          sent,
          queued: counts.queued || 0,
          dead: counts.dead || 0,
          successRate: rate,
        });
      }

      // Compute daily distribution from real deliveries
      const deliveries = dRes.ok && dRes.data ? dRes.data : [];
      const dayCounts = {};
      const ratePoints = [];

      deliveries.forEach((d) => {
        const dt = new Date(d.created_at || Date.now());
        const dateKey = dt.toISOString().split('T')[0];
        dayCounts[dateKey] = (dayCounts[dateKey] || 0) + 1;

        const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        ratePoints.push({ time: timeStr, value: 1 });
      });

      // Prepare 14 daily bars
      const today = new Date();
      const bars = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        bars.push({ value: dayCounts[key] || (i === 0 ? deliveries.length : 0) });
      }
      setDailyData(bars);

      // Prepare rate limit points
      if (deliveries.length > 0) {
        const groupedByHour = {};
        deliveries.forEach(d => {
          const t = new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          groupedByHour[t] = (groupedByHour[t] || 0) + 1;
        });
        const points = Object.entries(groupedByHour).map(([time, value]) => ({ time, value }));
        setRateLimitData(points.length > 0 ? points : [{ time: 'Now', value: deliveries.length }]);
      } else {
        setRateLimitData([
          { time: '09:00', value: 0 },
          { time: '10:00', value: 0 },
          { time: '11:00', value: 0 },
          { time: 'Now', value: 0 },
        ]);
      }

      setLoading(false);
    }
    loadUsage();
  }, [timeFilter]);

  const rateLimit = clientInfo?.rate_limit_per_sec || 50;
  const planName = rateLimit >= 100 ? 'Scale' : (rateLimit >= 50 ? 'Growth' : 'Starter');
  const planLimit = rateLimit >= 100 ? 500000 : (rateLimit >= 50 ? 100000 : 10000);
  const planUsagePct = Math.min(100, (metrics.sent / planLimit) * 100);

  return (
    <div className="client-usage">
      <div className="page-header">
        <div className="page-header-text">
          <h1>Usage</h1>
          <p>Live metrics and capacity tracking for your account.</p>
        </div>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {['Last 7 days', 'Last month', 'Last 3 months', 'Last year'].map((f) => (
          <button
            key={f}
            className={`filter-pill ${timeFilter === f ? 'active' : ''}`}
            onClick={() => setTimeFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {/* 4 Stat Cards */}
      <div className="stat-cards-grid">
        <div className="stat-card">
          <div className="stat-card-label">Emails sent</div>
          <div className="stat-card-value">{metrics.sent.toLocaleString()}</div>
          <div className="stat-card-desc">delivered & queued</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Delivered</div>
          <div className="stat-card-value" style={{ color: 'var(--color-green-text)' }}>
            {metrics.successRate}
          </div>
          <div className="stat-card-desc">success rate</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Dead letters</div>
          <div className="stat-card-value" style={{ color: metrics.dead > 0 ? 'var(--color-red-text)' : 'var(--color-green-text)' }}>
            {metrics.dead}
          </div>
          <div className="stat-card-desc">exhausted retries</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Configured limit</div>
          <div className="stat-card-value" style={{ color: 'var(--color-orange-text)' }}>
            {rateLimit}/s
          </div>
          <div className="stat-card-desc">{planName} plan cap</div>
        </div>
      </div>

      {/* Middle row: Bar Chart & Plan Usage */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '20px', marginBottom: '24px' }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Emails sent per day</div>
            </div>
          </div>
          <DailyBarChart data={dailyData} height={190} />
        </div>

        <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="card-header">
              <div className="card-title">Plan usage</div>
            </div>

            <div style={{ fontSize: '26px', fontWeight: 700, color: '#ffffff', marginBottom: '12px' }}>
              {metrics.sent.toLocaleString()} <span style={{ fontSize: '14px', color: '#8c93a7', fontWeight: 400 }}>of {planLimit.toLocaleString()}</span>
            </div>

            {/* Progress bar */}
            <div style={{ width: '100%', height: '8px', background: '#202431', borderRadius: '9999px', overflow: 'hidden', marginBottom: '14px' }}>
              <div style={{ width: `${Math.max(2, planUsagePct)}%`, height: '100%', background: '#ffffff', borderRadius: '9999px' }}></div>
            </div>

            <div style={{ fontSize: '12px', color: '#585f73', marginBottom: '18px' }}>
              Current billing period · {planUsagePct}% utilized
            </div>

            <div style={{ fontSize: '13px', color: '#8c93a7', background: '#161922', padding: '12px 14px', borderRadius: '10px', border: '1px solid #202431' }}>
              You are on the {planName} plan. Need higher throughput? You can upgrade anytime.
            </div>
          </div>

          <div style={{ marginTop: '20px' }}>
            <button className="btn-primary" onClick={onNavigateToPlans}>
              See plans
            </button>
          </div>
        </div>
      </div>

      {/* Bottom: Rate limit chart */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Rate limit</div>
            <div className="card-subtitle">
              Requests per second throughput. Configured limit: {rateLimit}/sec.
            </div>
          </div>
        </div>

        <RateLimitChart data={rateLimitData} limit={rateLimit} height={190} />
      </div>
    </div>
  );
}
