import React, { useState } from 'react'
import { useAuth } from '../auth'
import { Link } from '../router'
import { LogoMark } from '../components/LogoMark'

export function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password || loading) return

    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err.message || 'Wrong email or password')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      backgroundColor: 'var(--color-page)',
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: '420px',
        padding: '36px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        <div style={{ marginBottom: '20px' }}>
          <LogoMark size={48} />
        </div>

        <h1 style={{ fontSize: '22px', marginBottom: '8px', textAlign: 'center' }}>
          Welcome back
        </h1>
        <p style={{ fontSize: '13px', marginBottom: '28px', textAlign: 'center' }}>
          Sign in to your NotifyHub console
        </p>

        {error && (
          <div style={{
            width: '100%',
            padding: '12px 16px',
            marginBottom: '20px',
            backgroundColor: 'var(--color-red-bg)',
            border: '1px solid rgba(248, 113, 113, 0.3)',
            borderRadius: 'var(--radius-inner)',
            color: 'var(--color-red)',
            fontSize: '13px',
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px' }}
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div style={{ marginTop: '24px', fontSize: '13px', color: 'var(--color-muted)' }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ color: '#ffffff', fontWeight: 500, textDecoration: 'underline' }}>
            Sign up
          </Link>
        </div>
      </div>
    </div>
  )
}
