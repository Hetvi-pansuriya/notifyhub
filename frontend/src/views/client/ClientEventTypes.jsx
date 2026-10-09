import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export function ClientEventTypes() {
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(1);
  const [ttlSeconds, setTtlSeconds] = useState('');
  const [retrySchedule, setRetrySchedule] = useState('5, 10, 20, 40');
  const [optOut, setOptOut] = useState(true);
  const [sensitive, setSensitive] = useState(false);

  const fetchEventTypes = async () => {
    setLoading(true);
    const res = await api.getEventTypes();
    if (res.ok && res.data) {
      setEventTypes(res.data.map(et => ({
        ...et,
        expires_display: et.ttl_seconds ? `${Math.round(et.ttl_seconds / 60)} minutes` : 'Never',
        retry_display: et.retry_schedule && et.retry_schedule.length > 0 ? et.retry_schedule.map(s => `${s}s`).join(', ') : 'None',
      })));
    } else {
      setEventTypes([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEventTypes();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    const delays = retrySchedule.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    const ttl = ttlSeconds ? parseInt(ttlSeconds, 10) : null;

    const res = await api.createEventType({
      name: name.trim(),
      priority: parseInt(priority, 10),
      ttl_seconds: ttl,
      retry_schedule: delays,
      opt_out: optOut,
      sensitive: sensitive,
    });

    if (res.ok) {
      setShowModal(false);
      setName('');
      fetchEventTypes();
      alert('Event type created successfully!');
    } else {
      alert(res.error || 'Failed to create event type');
    }
  };

  const getPriorityBadge = (p) => {
    if (p >= 2) return <span className="badge badge-red">High (2)</span>;
    if (p === 1) return <span className="badge badge-orange">Normal (1)</span>;
    return <span className="badge badge-gray">Low (0)</span>;
  };

  return (
    <div className="client-event-types">
      <div className="page-header">
        <div className="page-header-text">
          <h1>Event types</h1>
          <p>Choose how urgent each kind of email is and what happens if it fails.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            New event type
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Event type</th>
                <th>Priority</th>
                <th>Expires after</th>
                <th>Retry after</th>
                <th>Respect opt-outs</th>
                <th>Sensitive</th>
              </tr>
            </thead>
            <tbody>
              {eventTypes.map((et) => (
                <tr key={et.id}>
                  <td style={{ fontWeight: 600, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                    {et.name}
                  </td>
                  <td>{getPriorityBadge(et.priority)}</td>
                  <td style={{ color: '#8c93a7' }}>{et.expires_display}</td>
                  <td style={{ color: '#8c93a7' }}>{et.retry_display}</td>
                  <td>
                    <span className={`badge ${et.opt_out ? 'badge-green' : 'badge-gray'}`}>
                      {et.opt_out ? 'Yes' : 'Ignored'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${et.sensitive ? 'badge-orange' : 'badge-gray'}`}>
                      {et.sensitive ? '🔒 Yes' : 'No'}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && eventTypes.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#8c93a7' }}>
                    No event types configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="info-banner" style={{ marginTop: '20px' }}>
          <span>High priority emails like OTP codes always go first, even when thousands of normal events are waiting.</span>
        </div>
      </div>

      {/* New Event Type Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Configure New Event Type</div>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Event Type Identifier</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    placeholder="e.g. invoice_created"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select
                    className="form-input"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value={2}>High (Jumps Queue, e.g. OTPs)</option>
                    <option value={1}>Normal (Standard FIFO intake)</option>
                    <option value={0}>Low (Bulk / Newsletters)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">TTL Expiry (Seconds, optional)</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="e.g. 300 for 5 minutes"
                    value={ttlSeconds}
                    onChange={(e) => setTtlSeconds(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Retry Schedule Delays (Seconds, comma-separated)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={retrySchedule}
                    onChange={(e) => setRetrySchedule(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span className="form-label">Respect Opt-Outs</span>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={optOut} onChange={() => setOptOut(!optOut)} />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span className="form-label">Sensitive (Wipe secrets immediately after dispatch)</span>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={sensitive} onChange={() => setSensitive(!sensitive)} />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Event Type
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
