import React, { createContext, useContext, useEffect, useState } from 'react'
import { request, ApiError } from './api'
import { navigate, useRoute } from './router'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState({
    status: 'loading', // 'loading' | 'anonymous' | 'authenticated'
    user: null,
    client: null,
  })

  const { path } = useRoute()

  // On initial mount, verify session via GET /console/auth/me
  useEffect(() => {
    let isMounted = true

    async function checkAuth() {
      try {
        const data = await request('/console/auth/me')
        if (isMounted) {
          setAuthState({
            status: 'authenticated',
            user: data.user,
            client: data.client,
          })
        }
      } catch {
        if (isMounted) {
          setAuthState({
            status: 'anonymous',
            user: null,
            client: null,
          })
        }
      }
    }

    checkAuth()
    return () => {
      isMounted = false
    }
  }, [])

  // Route enforcement & redirection guards
  useEffect(() => {
    if (authState.status === 'loading') return

    const isAppPath = path.startsWith('/app')
    const isAdminPath = path.startsWith('/admin')
    const isAuthPath = path === '/login' || path === '/signup'
    const isRoot = path === '/'

    if (authState.status === 'anonymous') {
      if (isAppPath || isAdminPath) {
        navigate('/login', true)
      }
    } else if (authState.status === 'authenticated') {
      const { user } = authState
      if (isAuthPath) {
        if (user.role === 'admin') {
          navigate('/admin/overview', true)
        } else {
          navigate('/app/dashboard', true)
        }
      } else if (user.role === 'owner' && isAdminPath) {
        // Owner trying to reach admin -> redirect to app dashboard
        navigate('/app/dashboard', true)
      } else if (user.role === 'admin' && isAppPath) {
        // Admin trying to reach app -> redirect to admin overview
        navigate('/admin/overview', true)
      }
    }
  }, [authState, path])

  async function login(email, password) {
    const data = await request('/console/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    setAuthState({
      status: 'authenticated',
      user: data.user,
      client: data.client,
    })
    if (data.user.role === 'admin') {
      navigate('/admin/overview')
    } else {
      navigate('/app/dashboard')
    }
    return data
  }

  async function signup(companyName, email, password) {
    const data = await request('/console/auth/signup', {
      method: 'POST',
      body: {
        company_name: companyName,
        email,
        password,
      },
    })
    setAuthState({
      status: 'authenticated',
      user: data.user,
      client: data.client,
    })
    navigate('/app/dashboard')
    return data
  }

  async function logout() {
    try {
      await request('/console/auth/logout', { method: 'POST' })
    } catch {
      // Ignore network errors on logout
    } finally {
      setAuthState({
        status: 'anonymous',
        user: null,
        client: null,
      })
      navigate('/login')
    }
  }

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
