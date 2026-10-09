import React, { useState, useEffect } from 'react';
import { api, getClientInfo } from '../../api';

export function ClientProfilePlan() {
  const [clientInfo, setClientInfo] = useState(getClientInfo());
  const [fromName, setFromName] = useState('');
  const [replyToEmail, setReplyToEmail] = useState('');
  const [senderEmail, setSenderEmail] = useState('no-reply@notifyhub.local');
  const [dailyLimit, setDailyLimit] = useState(30);
  const [sentToday, setSentToday] = useState(0);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    async function fetchMe() {
      const res = await api.getMe();
      if (res.ok && res.data) {
        setClientInfo(res.data);
      }
    }
    async function fetchClientIdentity() {
      const res = await api.getClientIdentity();
      if (res.ok && res.data) {
        setFromName(res.data.from_name || '');
        setReplyToEmail(res.data.reply_to_email || '');
        setSenderEmail(res.data.sender_email || 'no-reply@notifyhub.local');
        setDailyLimit(res.data.daily_email_limit ?? 30);
        setSentToday(res.data.sent_today ?? 0);
      }
    }
    fetchMe();
    fetchClientIdentity();
  }, []);

  const handleSaveIdentity = async (e) => {
    e.preventDefault();
    setIdentitySaving(true);
    setBanner(null);

    const payload = {
      from_name: fromName.trim() ? fromName.trim() : null,
      reply_to_email: replyToEmail.trim() ? replyToEmail.trim() : null,
    };

    const res = await api.updateClientIdentity(payload);
    setIdentitySaving(false);

    if (res.ok && res.data) {
      setFromName(res.data.from_name || '');
      setReplyToEmail(res.data.reply_to_email || '');
      setSenderEmail(res.data.sender_email || 'no-reply@notifyhub.local');
      setDailyLimit(res.data.daily_email_limit ?? 30);
      setSentToday(res.data.sent_today ?? 0);
      setBanner({ type: 'success', message: 'Sending identity saved successfully.' });
    } else {
      setBanner({ type: 'error', message: res.error || 'Failed to update sending identity.' });
    }
  };

  const billingHistory = [
    { date: '1 Oct 2026', plan: 'Growth plan', amount: '₹4,999', status: 'Paid' },
    { date: '1 Sep 2026', plan: 'Growth plan', amount: '₹4,999', status: 'Paid' },
    { date: '1 Aug 2026', plan: 'Growth plan', amount: '₹4,999', status: 'Paid' },
  ];

  const clientName = clientInfo?.name || 'FakeShop';
  const clientEmail = `dev@${clientName.toLowerCase().replace(/\s+/g, '')}.example`;
  const rateLimit = clientInfo?.rate_limit_per_sec || 50;

  return (
    <div className="client-profile-plan">
      <div className="page-header">
        <div className="page-header-text">
          <h1>Profile & Plan</h1>
          <p>Your account, your subscription and your receipts.</p>
        </div>
      </div>

      {/* Sending identity card */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <div className="card-title">Sending identity</div>
        </div>

        {/* Live preview line */}
        <div
          style={{
            backgroundColor: '#0e111a',
            border: '1px solid #1f2535',
            borderRadius: '8px',
            padding: '14px 18px',
            marginBottom: '20px',
            fontSize: '13.5px',
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#818cf8', fontWeight: 600, marginBottom: '6px' }}>
            Live Preview
          </div>
          <div style={{ color: '#e2e8f0', fontFamily: 'var(--font-mono, monospace)', fontSize: '13px' }}>
            Your emails appear as:{' '}
            <strong style={{ color: '#ffffff' }}>
              {fromName ? `${fromName} via NotifyHub <${senderEmail}>` : `via NotifyHub <${senderEmail}>`}
            </strong>
          </div>
        </div>

        {banner && (
          <div
            style={{
              padding: '10px 16px',
              borderRadius: '6px',
              fontSize: '13px',
              marginBottom: '16px',
              backgroundColor: banner.type === 'success' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${banner.type === 'success' ? '#22c55e' : '#ef4444'}`,
              color: banner.type === 'success' ? '#4ade80' : '#fca5a5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{banner.message}</span>
            <button
              onClick={() => setBanner(null)}
              style={{ color: 'inherit', fontSize: '16px', padding: '0 4px', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
        )}

        <form onSubmit={handleSaveIdentity}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="identity-from-name">Display name</label>
              <input
                id="identity-from-name"
                className="form-input"
                type="text"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="e.g. Acme Support"
              />
              <div style={{ fontSize: '12px', color: '#8c93a7', marginTop: '4px' }}>
                Shown next to NotifyHub's sending address
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="identity-reply-to">Reply-to email</label>
              <input
                id="identity-reply-to"
                className="form-input"
                type="email"
                value={replyToEmail}
                onChange={(e) => setReplyToEmail(e.target.value)}
                placeholder="support@yourdomain.com"
              />
              <div style={{ fontSize: '12px', color: '#8c93a7', marginTop: '4px' }}>
                Where recipients' replies go. Optional.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #1a1d27' }}>
            <div style={{ fontSize: '13px', color: '#8c93a7' }}>
              Daily limit: <strong style={{ color: '#ffffff' }}>{dailyLimit}</strong> emails (<strong style={{ color: '#ffffff' }}>{sentToday}</strong> sent today)
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={identitySaving}
              style={{ minWidth: '120px' }}
            >
              {identitySaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>

      {/* Top 2 Cards: Account & Subscription */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
        {/* Account card */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div className="card-title">Account</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1a1d27', paddingBottom: '10px' }}>
              <span style={{ color: '#8c93a7' }}>Company</span>
              <span style={{ color: '#ffffff', fontWeight: 600 }}>{clientName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1a1d27', paddingBottom: '10px' }}>
              <span style={{ color: '#8c93a7' }}>Email</span>
              <span style={{ color: '#ffffff' }}>{clientEmail}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1a1d27', paddingBottom: '10px' }}>
              <span style={{ color: '#8c93a7' }}>Sending address</span>
              <span style={{ color: '#ffffff' }}>{senderEmail}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '4px' }}>
              <span style={{ color: '#8c93a7' }}>Throughput Limit</span>
              <span style={{ color: '#ffffff', fontWeight: 500 }}>{rateLimit} requests / sec</span>
            </div>
          </div>
        </div>

        {/* Subscription card (Static as requested) */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div className="card-title">Subscription</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1a1d27', paddingBottom: '10px' }}>
              <span style={{ color: '#8c93a7' }}>Plan</span>
              <span style={{ color: '#ffffff', fontWeight: 500 }}>Growth</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1a1d27', paddingBottom: '10px' }}>
              <span style={{ color: '#8c93a7' }}>Status</span>
              <span className="badge badge-green">Active</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1a1d27', paddingBottom: '10px' }}>
              <span style={{ color: '#8c93a7' }}>Renews on</span>
              <span style={{ color: '#ffffff', fontWeight: 500 }}>1 Nov 2026</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '4px' }}>
              <span style={{ color: '#8c93a7' }}>Payment method</span>
              <span style={{ color: '#ffffff', fontWeight: 500 }}>Card ending 4242</span>
            </div>
          </div>
        </div>
      </div>

      {/* Plans Section (Static as requested) */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#8c93a7', marginBottom: '14px' }}>
          Plans (Static Pricing Tiers)
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
          {/* Starter Plan */}
          <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13.5px', color: '#8c93a7', marginBottom: '8px' }}>Starter</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: '#fff', marginBottom: '16px' }}>
                ₹1,999<span style={{ fontSize: '13px', color: '#8c93a7', fontWeight: 400 }}>/month</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px', color: '#8c93a7' }}>
                <div>10,000 emails a month</div>
                <div>10 requests per second</div>
                <div>Priority sending</div>
                <div>Email support</div>
              </div>
            </div>
            <div style={{ marginTop: '24px' }}>
              <button className="btn-primary" style={{ width: '100%' }} onClick={() => alert('Static demo plan')}>
                Choose Starter
              </button>
            </div>
          </div>

          {/* Growth Plan (Active) */}
          <div className="card" style={{ marginBottom: 0, borderColor: '#3b82f6', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13.5px', color: '#60a5fa', marginBottom: '8px' }}>Growth · your plan</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: '#fff', marginBottom: '16px' }}>
                ₹4,999<span style={{ fontSize: '13px', color: '#8c93a7', fontWeight: 400 }}>/month</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px', color: '#8c93a7' }}>
                <div>100,000 emails a month</div>
                <div>50 requests per second</div>
                <div>Priority sending</div>
                <div>Email support</div>
              </div>
            </div>
            <div style={{ marginTop: '24px' }}>
              <button className="btn-secondary" style={{ width: '100%', cursor: 'default' }}>
                Current plan
              </button>
            </div>
          </div>

          {/* Scale Plan */}
          <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13.5px', color: '#8c93a7', marginBottom: '8px' }}>Scale</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: '#fff', marginBottom: '16px' }}>
                ₹14,999<span style={{ fontSize: '13px', color: '#8c93a7', fontWeight: 400 }}>/month</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px', color: '#8c93a7' }}>
                <div>1,000,000 emails a month</div>
                <div>200 requests per second</div>
                <div>Priority sending</div>
                <div>Dedicated support</div>
              </div>
            </div>
            <div style={{ marginTop: '24px' }}>
              <button className="btn-primary" style={{ width: '100%' }} onClick={() => alert('Static demo plan')}>
                Choose Scale
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Billing history (Static as requested) */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Billing history</div>
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
              {billingHistory.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ color: '#fff' }}>{item.date}</td>
                  <td>{item.plan}</td>
                  <td style={{ color: '#fff' }}>{item.amount}</td>
                  <td>
                    <span className="badge badge-green">{item.status}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-action-small" onClick={() => alert(`Receipt downloaded for ${item.date}`)}>
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
