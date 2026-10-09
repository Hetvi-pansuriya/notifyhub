import React from 'react';

export function AdminPlans() {
  const plans = [
    {
      name: 'Starter',
      price: '₹1,999',
      emails: '10,000 emails a month',
      speed: '10 requests per second',
      templates: '5 templates',
      clientsCount: '9 clients on this plan',
    },
    {
      name: 'Growth',
      price: '₹4,999',
      emails: '100,000 emails a month',
      speed: '50 requests per second',
      templates: '25 templates',
      clientsCount: '11 clients on this plan',
    },
    {
      name: 'Scale',
      price: '₹14,999',
      emails: '1,000,000 emails a month',
      speed: '200 requests per second',
      templates: 'Unlimited templates',
      clientsCount: '4 clients on this plan',
    },
  ];

  return (
    <div className="admin-plans">
      <div className="page-header">
        <div className="page-header-text">
          <h1>Plans</h1>
          <p>The subscription plans NotifyHub offers.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-primary" onClick={() => alert('New plan creation')}>
            New plan
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '24px' }}>
        {plans.map((p) => (
          <div key={p.name} className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{p.name}</span>
                <button className="btn-action-small" onClick={() => alert(`Edit ${p.name}`)}>
                  Edit
                </button>
              </div>

              <div style={{ fontSize: '26px', fontWeight: 700, color: '#fff', marginBottom: '18px' }}>
                {p.price}<span style={{ fontSize: '13px', color: '#8c93a7', fontWeight: 400 }}>/month</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#8c93a7', marginBottom: '24px' }}>
                <div>[n] {p.emails}</div>
                <div>[n] {p.speed}</div>
                <div>[n] {p.templates}</div>
              </div>
            </div>

            <div style={{ fontSize: '12.5px', color: '#585f73', borderTop: '1px solid #1a1e2b', paddingTop: '14px' }}>
              {p.clientsCount}
            </div>
          </div>
        ))}
      </div>

      <div className="info-banner">
        <span>Changing a plan affects its clients from their next billing date.</span>
      </div>
    </div>
  );
}
