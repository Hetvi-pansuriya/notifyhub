import React, { useState } from 'react'
import { useAuth } from '../auth'
import { navigate, Link } from '../router'
import { LogoMark } from '../components/LogoMark'
import '../styles/Landing.css'

export function Landing() {
  const { status, user } = useAuth()
  const [activeTab, setActiveTab] = useState('curl')
  const [copied, setCopied] = useState(false)

  const isAuthenticated = status === 'authenticated' && user

  const handleGetStarted = () => {
    if (isAuthenticated) {
      if (user.role === 'admin') {
        navigate('/admin/overview')
      } else {
        navigate('/app/dashboard')
      }
    } else {
      navigate('/login')
    }
  }

  const codeSnippets = {
    curl: `curl -X POST https://api.notifyhub.dev/api/events \\
  -H "X-API-Key: nh_live_49f82ab91c8042e..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_type": "user_report",
    "recipient": "alex@company.com",
    "payload": {
      "user_name": "Alex Mercer",
      "period": "October 2026",
      "download_url": "https://app.company.com/reports/oct-2026"
    },
    "attachments": [
      {
        "filename": "monthly_report.pdf",
        "content_base64": "JVBERi0xLjQKJeLjz9MKMSAwIG9iago8...",
        "content_type": "application/pdf"
      }
    ]
  }'`,
    python: `import requests

url = "https://api.notifyhub.dev/api/events"
headers = {
    "X-API-Key": "nh_live_49f82ab91c8042e...",
    "Content-Type": "application/json"
}

payload = {
    "event_type": "user_report",
    "recipient": "alex@company.com",
    "payload": {
        "user_name": "Alex Mercer",
        "period": "October 2026"
    },
    "attachments": [
        {
            "filename": "monthly_report.pdf",
            "content_base64": "JVBERi0xLjQKJeLjz9MKMSAwIG9iago8...",
            "content_type": "application/pdf"
        }
    ]
}

response = requests.post(url, json=payload, headers=headers)
print(response.status_code, response.json())`,
    nodejs: `const axios = require('axios');

async function sendNotification() {
  const response = await axios.post(
    'https://api.notifyhub.dev/api/events',
    {
      event_type: 'user_report',
      recipient: 'alex@company.com',
      payload: {
        user_name: 'Alex Mercer',
        period: 'October 2026'
      },
      attachments: [
        {
          filename: 'monthly_report.pdf',
          content_base64: 'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8...',
          content_type: 'application/pdf'
        }
      ]
    },
    {
      headers: {
        'X-API-Key': 'nh_live_49f82ab91c8042e...',
        'Content-Type': 'application/json'
      }
    }
  );

  console.log('Queued delivery:', response.data);
}

sendNotification();`,
    go: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

func main() {
	payload := map[string]interface{}{
		"event_type": "user_report",
		"recipient":  "alex@company.com",
		"payload": map[string]string{
			"user_name": "Alex Mercer",
			"period":    "October 2026",
		},
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "https://api.notifyhub.dev/api/events", bytes.NewBuffer(body))
	req.Header.Set("X-API-Key", "nh_live_49f82ab91c8042e...")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, _ := client.Do(req)
	defer resp.Body.Close()

	fmt.Println("Status:", resp.Status)
}`
  }

  const responseJson = `{
  "event_id": "evt_01jax89b4f2c001",
  "delivery_id": "del_01jax89b4f2c002",
  "status": "queued",
  "event_type": "user_report",
  "recipient": "alex@company.com",
  "attachments_count": 1,
  "queue_latency_ms": 14,
  "created_at": "2026-10-10T11:20:04Z"
}`

  const copyCode = () => {
    navigator.clipboard.writeText(codeSnippets[activeTab])
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const scrollTo = (id) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="landing-page">
      {/* Top Sticky Header */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <LogoMark size={32} />
            <span className="landing-brand-text">NotifyHub</span>
            <span className="landing-brand-tag">v1.0 API</span>
          </div>

          <div className="landing-links">
            <span className="landing-link" onClick={() => scrollTo('quickstart')}>Quickstart</span>
            <span className="landing-link" onClick={() => scrollTo('architecture')}>Architecture</span>
            <span className="landing-link" onClick={() => scrollTo('features')}>Features</span>
            <span className="landing-link" onClick={() => scrollTo('plans')}>Plans</span>
          </div>

          <div className="landing-nav-actions">
            <div className="landing-status-badge">
              <span className="landing-status-dot" />
              <span>Operational</span>
            </div>

            {isAuthenticated ? (
              <button onClick={handleGetStarted} className="btn-landing-primary">
                Open Console
              </button>
            ) : (
              <>
                <Link to="/login" className="landing-link">
                  Sign in
                </Link>
                <button onClick={handleGetStarted} className="btn-landing-primary">
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="landing-hero landing-container">
        <div className="landing-pill">
          <span className="landing-pill-accent">PostgreSQL Queues</span>
          <span>•</span>
          <span>Zero External Broker Overhead</span>
        </div>

        <h1 className="landing-hero-title">
          Durable transactional email infrastructure for developers.
        </h1>

        <p className="landing-hero-subtitle">
          One unified API to send transactional emails, OTP logins, and PDF reports.
          Backed by atomic PostgreSQL row-level locks, Jinja2 template rendering, strict per-tenant
          rate limits, and end-to-end delivery observability.
        </p>

        <div className="landing-hero-cta">
          <button onClick={handleGetStarted} className="btn-landing-primary">
            <span>Get Started</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>

          <button onClick={() => scrollTo('quickstart')} className="btn-landing-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <span>Explore API</span>
          </button>
        </div>

        {/* Specs & Performance Bar */}
        <div className="landing-specs-grid">
          <div className="landing-spec-card">
            <div className="landing-spec-val">SKIP LOCKED</div>
            <div className="landing-spec-label">Durable PostgreSQL atomic queueing with zero dropped events</div>
          </div>
          <div className="landing-spec-card">
            <div className="landing-spec-val">&lt; 20ms</div>
            <div className="landing-spec-label">Average API ingestion latency with synchronous 202 Accepted</div>
          </div>
          <div className="landing-spec-card">
            <div className="landing-spec-val">5 MB PDF</div>
            <div className="landing-spec-label">Base64 multipart attachment pipeline for reports & invoices</div>
          </div>
          <div className="landing-spec-card">
            <div className="landing-spec-val">SendGrid ESP</div>
            <div className="landing-spec-label">Reputation-protected delivery with jittered exponential retry</div>
          </div>
        </div>
      </header>

      {/* Code Studio / Quickstart Section */}
      <section id="quickstart" className="landing-code-section landing-container">
        <div className="landing-section-header">
          <span className="landing-section-tag">Interactive Quickstart</span>
          <h2 className="landing-section-title">Trigger emails with one clean POST request</h2>
          <p className="landing-section-desc">
            No complex SMTP libraries or background task setups in your app. Pass your event type, recipient, and payload.
          </p>
        </div>

        <div className="landing-code-card">
          <div className="landing-code-header">
            <div className="landing-code-tabs">
              {['curl', 'python', 'nodejs', 'go'].map((tab) => (
                <button
                  key={tab}
                  className={`landing-code-tab ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'curl' ? 'cURL' : tab === 'nodejs' ? 'Node.js' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            <button onClick={copyCode} className="landing-copy-btn">
              {copied ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span style={{ color: '#10b981' }}>Copied!</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          <div className="landing-code-layout">
            <div className="landing-code-pane">
              <div className="landing-code-pane-label">
                <span>Request Payload</span>
                <span style={{ color: '#60a5fa' }}>POST /api/events</span>
              </div>
              <pre className="landing-code-pre">{codeSnippets[activeTab]}</pre>
            </div>

            <div className="landing-response-pane">
              <div className="landing-code-pane-label">
                <span>Synchronous Response</span>
                <span style={{ color: '#34d399' }}>HTTP 202 Accepted</span>
              </div>
              <pre className="landing-code-pre" style={{ color: '#94a3b8' }}>
                {responseJson}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture Pipeline */}
      <section id="architecture" className="landing-arch-section landing-container">
        <div className="landing-section-header">
          <span className="landing-section-tag">Architecture</span>
          <h2 className="landing-section-title">Engineered for durability from event to inbox</h2>
          <p className="landing-section-desc">
            A resilient multi-stage processing pipeline built with PostgreSQL row-level locks, guaranteeing zero dropped emails.
          </p>
        </div>

        <div className="landing-pipeline-grid">
          <div className="landing-pipeline-card">
            <span className="landing-step-badge">STEP 01</span>
            <h3 className="landing-pipeline-title">Ingest &amp; Authorize</h3>
            <p className="landing-pipeline-desc">
              FastAPI validates the request against tenant API keys, verifies tenant daily limits, and validates payload schema in under 20ms.
            </p>
          </div>

          <div className="landing-pipeline-card">
            <span className="landing-step-badge">STEP 02</span>
            <h3 className="landing-pipeline-title">Durable Queueing</h3>
            <p className="landing-pipeline-desc">
              Deliveries are committed to PostgreSQL using transactional row locks. Even if worker containers restart, no in-flight delivery is ever lost.
            </p>
          </div>

          <div className="landing-pipeline-card">
            <span className="landing-step-badge">STEP 03</span>
            <h3 className="landing-pipeline-title">Template &amp; Attachments</h3>
            <p className="landing-pipeline-desc">
              Jinja2 compiles responsive HTML and plaintext bodies with client variables, encoding PDF attachments up to 5 MB on demand.
            </p>
          </div>

          <div className="landing-pipeline-card">
            <span className="landing-step-badge">STEP 04</span>
            <h3 className="landing-pipeline-title">ESP Dispatch &amp; Retry</h3>
            <p className="landing-pipeline-desc">
              Outbound token buckets throttle traffic to SendGrid. Transient network errors automatically retry with backoff before dead-lettering.
            </p>
          </div>
        </div>
      </section>

      {/* Platform Features Grid */}
      <section id="features" className="landing-features-section landing-container">
        <div className="landing-section-header">
          <span className="landing-section-tag">Capabilities</span>
          <h2 className="landing-section-title">Everything modern backend systems require</h2>
          <p className="landing-section-desc">
            Designed to replace ad-hoc mail libraries with an enterprise-grade notification platform.
          </p>
        </div>

        <div className="landing-features-grid">
          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
            </div>
            <h3 className="landing-feature-title">PostgreSQL Queue Engine</h3>
            <p className="landing-feature-desc">
              Eliminate Redis or RabbitMQ infrastructure. Row-level `SKIP LOCKED` worker loops ensure atomic task claiming and zero duplicate sends.
            </p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <h3 className="landing-feature-title">Dynamic Jinja2 Templates</h3>
            <p className="landing-feature-desc">
              Centralized email templates with variable substitution, fallback defaults, and live side-by-side previewing in the client dashboard.
            </p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </div>
            <h3 className="landing-feature-title">Native PDF Attachments</h3>
            <p className="landing-feature-desc">
              Send automated invoices, tickets, and analytics reports. Handles up to 3 attachments and 5 MB total payload per event effortlessly.
            </p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 className="landing-feature-title">Scoped API Keys &amp; HMAC</h3>
            <p className="landing-feature-desc">
              Multiple API keys per client tenant with distinct names, instant revocation, prefix recognition, and HMAC-signed webhook delivery.
            </p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <h3 className="landing-feature-title">Tenant Rate Limiting</h3>
            <p className="landing-feature-desc">
              Built-in token bucket algorithms enforce both burst per-second limits and daily email volume quotas to protect ESP reputation.
            </p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h3 className="landing-feature-title">Deep Delivery Observability</h3>
            <p className="landing-feature-desc">
              Full timeline auditing for every email. Inspect HTTP status codes, provider message IDs, retry counts, error backtraces, and recipient metrics.
            </p>
          </div>
        </div>
      </section>

      {/* Plans Section */}
      <section id="plans" className="landing-plans-section landing-container">
        <div className="landing-section-header">
          <span className="landing-section-tag">Pricing</span>
          <h2 className="landing-section-title">The subscription plans NotifyHub offers</h2>
          <p className="landing-section-desc">
            Transparent developer plans tailored to your application's email volume and throughput requirements.
          </p>
        </div>

        <div className="landing-plans-grid">
          {/* Starter Plan */}
          <div className="landing-plan-card">
            <h3 className="landing-plan-name">Starter</h3>
            <p className="landing-plan-desc">Free tier for development and early stage apps</p>

            <div style={{ marginBottom: '24px' }}>
              <span style={{ fontSize: '32px', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '-0.02em' }}>
                ₹0
              </span>
              <span style={{ fontSize: '13px', color: 'var(--color-muted, #9a9a9f)', marginLeft: '6px' }}>
                /month
              </span>
            </div>

            <ul className="landing-plan-features">
              <li className="landing-plan-feature-item">
                <span className="landing-plan-feature-check">✓</span>
                <span>10,000 emails a month</span>
              </li>
              <li className="landing-plan-feature-item">
                <span className="landing-plan-feature-check">✓</span>
                <span>50 requests per second</span>
              </li>
              <li className="landing-plan-feature-item">
                <span className="landing-plan-feature-check">✓</span>
                <span>Unlimited templates</span>
              </li>
            </ul>

            <button onClick={handleGetStarted} className="btn-plan-select primary">
              Get Started
            </button>
          </div>

          {/* Growth Plan */}
          <div className="landing-plan-card featured">
            <span className="landing-plan-tag">POPULAR</span>
            <h3 className="landing-plan-name">Growth</h3>
            <p className="landing-plan-desc">Growing businesses requiring higher daily sending throughput</p>

            <div style={{ marginBottom: '24px' }}>
              <span style={{ fontSize: '32px', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '-0.02em' }}>
                ₹2,499
              </span>
              <span style={{ fontSize: '13px', color: 'var(--color-muted, #9a9a9f)', marginLeft: '6px' }}>
                /month
              </span>
            </div>

            <ul className="landing-plan-features">
              <li className="landing-plan-feature-item">
                <span className="landing-plan-feature-check">✓</span>
                <span>50,000 emails a month</span>
              </li>
              <li className="landing-plan-feature-item">
                <span className="landing-plan-feature-check">✓</span>
                <span>100 requests per second</span>
              </li>
              <li className="landing-plan-feature-item">
                <span className="landing-plan-feature-check">✓</span>
                <span>Unlimited templates</span>
              </li>
            </ul>

            <button onClick={handleGetStarted} className="btn-plan-select primary">
              Get Started
            </button>
          </div>

          {/* Scale Plan */}
          <div className="landing-plan-card">
            <h3 className="landing-plan-name">Scale</h3>
            <p className="landing-plan-desc">Large scale transactional email volume with dedicated rate ceilings</p>

            <div style={{ marginBottom: '24px' }}>
              <span style={{ fontSize: '32px', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '-0.02em' }}>
                ₹9,999
              </span>
              <span style={{ fontSize: '13px', color: 'var(--color-muted, #9a9a9f)', marginLeft: '6px' }}>
                /month
              </span>
            </div>

            <ul className="landing-plan-features">
              <li className="landing-plan-feature-item">
                <span className="landing-plan-feature-check">✓</span>
                <span>250,000 emails a month</span>
              </li>
              <li className="landing-plan-feature-item">
                <span className="landing-plan-feature-check">✓</span>
                <span>200 requests per second</span>
              </li>
              <li className="landing-plan-feature-item">
                <span className="landing-plan-feature-check">✓</span>
                <span>Unlimited templates</span>
              </li>
            </ul>

            <button onClick={handleGetStarted} className="btn-plan-select primary">
              Get Started
            </button>
          </div>
        </div>
      </section>

      {/* Bottom Call to Action */}
      <section className="landing-container">
        <div className="landing-bottom-cta">
          <h2>Ready to dispatch your first email?</h2>
          <p>
            Create your account in seconds, generate your tenant API key, and start sending with rock-solid durability.
          </p>
          <button onClick={handleGetStarted} className="btn-landing-primary">
            <span>Get Started Now</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <LogoMark size={24} />
            <span style={{ fontWeight: '600', color: '#ffffff', fontSize: '14px' }}>NotifyHub</span>
          </div>

          <div className="landing-footer-links">
            <span className="landing-footer-link" onClick={() => scrollTo('quickstart')} style={{ cursor: 'pointer' }}>Documentation</span>
            <span className="landing-footer-link" onClick={() => scrollTo('architecture')} style={{ cursor: 'pointer' }}>Architecture</span>
            <span className="landing-footer-link" onClick={() => scrollTo('plans')} style={{ cursor: 'pointer' }}>Plans</span>
            <Link to="/login" className="landing-footer-link">Console Login</Link>
          </div>

          <div className="landing-footer-copy">
            © {new Date().getFullYear()} NotifyHub. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
