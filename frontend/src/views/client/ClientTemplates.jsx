import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export function ClientTemplates() {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sampleDataJson, setSampleDataJson] = useState('{\n  "order_id": 1001,\n  "customer": "Alice",\n  "tracking": "TRK-USPS-1001"\n}');
  
  const [previewResult, setPreviewResult] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateSubject, setNewTemplateSubject] = useState('Order #{{ order_id }} is confirmed');
  const [newTemplateBody, setNewTemplateBody] = useState('Hello {{ customer }}, tracking: {{ tracking }}');

  const fetchTemplates = async () => {
    const res = await api.getTemplates();
    if (res.ok && res.data) {
      setTemplates(res.data);
      if (res.data.length > 0 && !selectedTemplate) {
        selectTemplate(res.data[0]);
      }
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const selectTemplate = (tmpl) => {
    setSelectedTemplate(tmpl);
    setSubject(tmpl.subject || '');
    setBody(tmpl.body || '');
    setPreviewResult(null);

    // Contextual sample data based on event name
    if (tmpl.name === 'login_otp') {
      setSampleDataJson('{\n  "code": "849201"\n}');
    } else {
      setSampleDataJson('{\n  "order_id": 1001,\n  "customer": "Alice",\n  "tracking": "TRK-USPS-1001"\n}');
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    setPreviewResult(null);

    let parsedData = {};
    try {
      parsedData = JSON.parse(sampleDataJson);
    } catch (e) {
      setPreviewResult({ ok: false, error: 'Sample data is invalid JSON' });
      setPreviewLoading(false);
      return;
    }

    const res = await api.previewTemplate(subject, body, parsedData);
    setPreviewLoading(false);
    setPreviewResult(res);
  };

  const handleMakeActive = async () => {
    if (!selectedTemplate) return;
    const res = await api.activateTemplate(selectedTemplate.id);
    if (res.ok) {
      alert(`Template '${selectedTemplate.name}' v${selectedTemplate.version} activated!`);
      fetchTemplates();
    } else {
      alert(res.error || 'Failed to activate template');
    }
  };

  const handleCreateNew = async (e) => {
    e.preventDefault();
    if (!newTemplateName.trim()) return;

    const res = await api.createTemplate(newTemplateName.trim(), newTemplateSubject, newTemplateBody);
    if (res.ok) {
      setShowNewModal(false);
      fetchTemplates();
      alert('Template created successfully!');
    } else {
      alert(res.error || 'Failed to create template');
    }
  };

  return (
    <div className="client-templates">
      <div className="page-header">
        <div className="page-header-text">
          <h1>Templates</h1>
          <p>Write your emails once. We fill in the details every time.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-primary" onClick={() => setShowNewModal(true)}>
            New template
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: '20px' }}>
        {/* Left Column: Template List */}
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {templates.map((tmpl) => {
              const isSelected = selectedTemplate?.id === tmpl.id;
              const isActive = tmpl.status === 'active';
              return (
                <div
                  key={tmpl.id}
                  onClick={() => selectTemplate(tmpl)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    backgroundColor: isSelected ? '#191c26' : '#14161e',
                    border: `1px solid ${isSelected ? '#2e3547' : '#1b1f2b'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '13.5px' }}>
                      {tmpl.name} <span style={{ color: '#8c93a7', fontWeight: 400 }}>v{tmpl.version || 1}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#687084', marginTop: '2px' }}>
                      {isActive ? 'Active live template' : 'Draft / Previous version'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className={`badge ${isActive ? 'badge-green' : 'badge-orange'}`} style={{ textTransform: 'capitalize' }}>
                      {tmpl.status || 'Draft'}
                    </span>
                    <button
                      className="btn-action-small"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectTemplate(tmpl);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
            {templates.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px', color: '#8c93a7' }}>
                No templates found in database. Click "New template" to create one.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Preview & Editor */}
        <div className="card">
          <div className="card-header" style={{ marginBottom: '16px' }}>
            <div>
              <div className="card-title">Preview & Sandboxed Test</div>
              <div className="card-subtitle">Try a draft with sample data before it goes live.</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Subject</label>
              <input
                type="text"
                className="form-input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Body</label>
              <textarea
                className="form-textarea"
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Sample Data (JSON)</label>
              <textarea
                className="form-textarea form-textarea-code"
                rows={4}
                value={sampleDataJson}
                onChange={(e) => setSampleDataJson(e.target.value)}
              />
            </div>

            <div className="info-banner">
              <span>Missing a variable? Strict Jinja2 will fail fast with HTTP 422 before queueing.</span>
            </div>

            {/* Live Render Output */}
            {previewResult && (
              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  backgroundColor: previewResult.ok ? '#10171a' : '#1d1214',
                  border: `1px solid ${previewResult.ok ? '#10b981' : '#ef4444'}`,
                }}
              >
                {previewResult.ok ? (
                  <div>
                    <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 600, marginBottom: '6px' }}>
                      ✓ RENDER SUCCESS (200 OK)
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#e2e8f0' }}>
                      <strong>Subject:</strong> {previewResult.data?.rendered_subject}
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#cbd5e1', marginTop: '4px' }}>
                      <strong>Body:</strong> {previewResult.data?.rendered_body}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600, marginBottom: '4px' }}>
                      RENDER ERROR ({previewResult.status})
                    </div>
                    <div style={{ fontSize: '12px', color: '#f87171' }}>{previewResult.error}</div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
              <button
                className="btn-primary"
                onClick={handlePreview}
                disabled={previewLoading}
              >
                {previewLoading ? 'Rendering...' : 'Preview'}
              </button>
              {selectedTemplate && selectedTemplate.status !== 'active' && (
                <button className="btn-secondary" onClick={handleMakeActive}>
                  Make active
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* New Template Modal */}
      {showNewModal && (
        <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Create New Template</div>
              <button className="modal-close-btn" onClick={() => setShowNewModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleCreateNew}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Event Type Identifier</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    placeholder="e.g. order_shipped, password_reset"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Subject</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    value={newTemplateSubject}
                    onChange={(e) => setNewTemplateSubject(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Body (Jinja2)</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    required
                    value={newTemplateBody}
                    onChange={(e) => setNewTemplateBody(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowNewModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
