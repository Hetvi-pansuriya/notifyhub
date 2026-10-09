import React, { useState, useEffect } from 'react';
import { api, getClientInfo } from '../../api';
import { SparklineChart } from '../../components/Charts';

export function ClientDashboard({ onOpenDeliveryModal }) {
  const [chartMode, setChartMode] = useState('line');
  const [timeFilter, setTimeFilter] = useState('today');
  const [clientInfo, setClientInfo] = useState(getClientInfo());
  const [metrics, setMetrics] = useState({
    sent: 0,
    queued: 0,
    dead: 0,
    pending: 0,
    successRate: '100%',
  });
  const [failedList, setFailedList] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [lastUpdated, setLastUpdated] = useState('just now');

  useEffect(() => {
    async function loadData() {
      // 1. Fetch real client profile
      const meRes = await api.getMe();
      if (meRes.ok && meRes.data) {
        setClientInfo(meRes.data);
      }

      // 2. Fetch real metrics from backend
      const res = await api.getClientMetrics();
      if (res.ok && res.data) {
        const counts = res.data.status_counts || {};
        setMetrics({
          sent: counts.sent || 0,
          queued: counts.queued || 0,
          dead: counts.dead || 0,
          pending: counts.processing || 0,
          successRate: res.data.success_rate !== null ? `${(res.data.success_rate * 100).toFixed(1)}%` : '100%',
        });
      }

      // 3. Fetch real dead/failed deliveries
      const delRes = await api.getDeliveries({ status: 'dead', limit: 10 });
      if (delRes.ok && delRes.data?.items) {
        setFailedList(delRes.data.items);
      } else {
        setFailedList([]);
      }

      // 4. Fetch recent deliveries to build real hourly chart
      const allDelivs = await api.getDeliveries({ limit: 100 });
      if (allDelivs.ok && allDelivs.data?.items) {
        const items = allDelivs.data.items;
        // Group by hour
        const hourlyBuckets = {};
        for (let h = 0; h < 24; h += 2) {
          const key = `${String(h).padStart(2, '0')}:00`;
          hourlyBuckets[key] = 0;
        }

        items.forEach((item) => {
          if (item.created_at) {
            const date = new Date(item.created_at);
            const hour = Math.floor(date.getHours() / 2) * 2;
            const key = `${String(hour).padStart(2, '0')}:00`;
            hourlyBuckets[key] = (hourlyBuckets[key] || 0) + 1;
          }
        });

        const points = Object.entries(hourlyBuckets).map(([time, value]) => ({ time, value }));
        setChartData(points);
      }

      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }

    loadData();
  }, []);

  const handleSendAgain = async (item) => {
    const res = await api.retryDelivery(item.id);
    if (res.ok) {
      setFailedList(prev => prev.filter(f => f.id !== item.id));
      alert('Delivery re-queued successfully!');
    } else {
      alert(res.error || 'Retry rejected');
    }
  };

  const handleSendAllAgain = async () => {
    for (const item of failedList) {
      await api.retryDelivery(item.id);
    }
    setFailedList([]);
    alert('All dead deliveries re-queued!');
  };

  const clientName = clientInfo?.name || 'FakeShop';

  return (
    <div className="client-dashboard">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-text">
          <h1>Good afternoon, {clientName}</h1>
          <p>Here is how your emails are doing today.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-secondary" style={{ fontSize: '12px' }}>
            Last updated {lastUpdated}
          </button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="stat-cards-grid">
        <div className="stat-card">
          <div className="stat-card-label">Pending</div>
          <div className="stat-card-value" style={{ color: 'var(--color-orange-text)' }}>
            {metrics.pending}
          </div>
          <div className="stat-card-desc">waiting for their turn</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">In queue</div>
          <div className="stat-card-value">{metrics.queued}</div>
          <div className="stat-card-desc">ready to be sent</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Sent today</div>
          <div className="stat-card-value" style={{ color: 'var(--color-green-text)' }}>
            {metrics.sent.toLocaleString()}
          </div>
          <div className="stat-card-desc">{metrics.successRate} delivered</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Failed</div>
          <div className="stat-card-value" style={{ color: 'var(--color-red-text)' }}>
            {metrics.dead}
          </div>
          <div className="stat-card-desc">needs a quick look</div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Requests sent today</div>
            <div className="card-subtitle">Live request volume from PostgreSQL queue</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ display: 'flex', background: '#161922', padding: '3px', borderRadius: '9999px', border: '1px solid #232838' }}>
              <button
                className={`filter-pill ${chartMode === 'line' ? 'active' : ''}`}
                style={{ padding: '3px 12px', fontSize: '12px', border: 'none' }}
                onClick={() => setChartMode('line')}
              >
                Line
              </button>
              <button
                className={`filter-pill ${chartMode === 'candles' ? 'active' : ''}`}
                style={{ padding: '3px 12px', fontSize: '12px', border: 'none' }}
                onClick={() => setChartMode('candles')}
              >
                Candles
              </button>
            </div>

            <div style={{ display: 'flex', background: '#161922', padding: '3px', borderRadius: '9999px', border: '1px solid #232838' }}>
              <button
                className={`filter-pill ${timeFilter === 'today' ? 'active' : ''}`}
                style={{ padding: '3px 12px', fontSize: '12px', border: 'none' }}
                onClick={() => setTimeFilter('today')}
              >
                Today
              </button>
              <button
                className={`filter-pill ${timeFilter === 'yesterday' ? 'active' : ''}`}
                style={{ padding: '3px 12px', fontSize: '12px', border: 'none' }}
                onClick={() => setTimeFilter('yesterday')}
              >
                Yesterday
              </button>
            </div>
          </div>
        </div>

        <SparklineChart
          data={chartData.length > 0 ? chartData : [{ time: '00:00', value: 0 }, { time: '12:00', value: metrics.sent }, { time: 'now', value: metrics.sent }]}
          mode={chartMode}
          height={220}
          timeLabel={timeFilter}
        />
      </div>

      {/* Failed Deliveries List */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Failed deliveries</div>
            <div className="card-subtitle">Check the reason, then send again with one click</div>
          </div>
          {failedList.length > 0 && (
            <button className="btn-primary" onClick={handleSendAllAgain}>
              Send all again
            </button>
          )}
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <tbody>
              {failedList.map((item) => (
                <tr key={item.id}>
                  <td style={{ width: '28%' }}>
                    <div className="table-person-cell">
                      <div className="avatar-circle">
                        {(item.to_email || 'U')[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="person-name">{item.to_email?.split('@')[0]}</div>
                        <div className="person-email">{item.to_email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ width: '20%' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#cbd5e1' }}>
                      {item.event_type || 'order_shipped'}
                    </span>
                  </td>
                  <td style={{ width: '22%', color: '#8c93a7' }}>
                    {item.last_error || 'Connection refused'}
                  </td>
                  <td style={{ width: '15%' }}>
                    <span className="badge badge-red">failed</span>
                  </td>
                  <td style={{ width: '15%', textAlign: 'right' }}>
                    <button
                      className="btn-action-small"
                      onClick={() => handleSendAgain(item)}
                    >
                      Send again
                    </button>
                  </td>
                </tr>
              ))}
              {failedList.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: '#10b981' }}>
                    ✓ No failed deliveries right now! All emails sent successfully.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
