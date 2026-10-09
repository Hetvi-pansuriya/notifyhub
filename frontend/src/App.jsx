import React, { useState } from 'react'
import { useAuth } from './auth'
import { useRoute, matchRoute } from './router'
import { Layout } from './components/Layout'

// Auth Pages
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { NotFound } from './pages/NotFound'

// Client Views (Full Real Interactive Views)
import { ClientDashboard } from './views/client/ClientDashboard'
import { ClientDeliveries } from './views/client/ClientDeliveries'
import { ClientTemplates } from './views/client/ClientTemplates'
import { ClientEventTypes } from './views/client/ClientEventTypes'
import { ClientRecipients } from './views/client/ClientRecipients'
import { ClientUsage } from './views/client/ClientUsage'
import { ApiKeys } from './pages/client/ApiKeys' // Full Self-Service API Keys manager
import { ClientPlan } from './views/client/ClientPlan'
import { ClientProfile } from './views/client/ClientProfile'

// Admin Views (Full Real Interactive Views)
import { AdminOverview } from './views/admin/AdminOverview'
import { AdminClients } from './views/admin/AdminClients'
import { AdminClientDetail } from './views/admin/AdminClientDetail'
import { AdminPlans } from './views/admin/AdminPlans'
import { AdminSystemHealth } from './views/admin/AdminSystemHealth'
import { AdminAuditLog } from './views/admin/AdminAuditLog'
import { AdminSettings } from './views/admin/AdminSettings'

// Global Modals
import { DeliveryDetailModal } from './components/DeliveryDetailModal'

export function App() {
  const { status, user } = useAuth()
  const { path, navigate } = useRoute()

  // Modal & Detail states
  const [selectedDelivery, setSelectedDelivery] = useState(null)
  const [selectedAdminClient, setSelectedAdminClient] = useState(null)

  if (status === 'loading') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--color-page)',
          color: 'var(--color-muted)',
          fontSize: '14px',
        }}
      >
        Loading NotifyHub...
      </div>
    )
  }

  // Public Auth Pages
  if (path === '/login') {
    return <Login />
  }
  if (path === '/signup') {
    return <Signup />
  }

  const renderContent = () => {
    // Client Console Routes
    if (path === '/app' || path === '/app/' || path === '/app/dashboard') {
      return <ClientDashboard onOpenDeliveryModal={(del) => setSelectedDelivery(del)} />
    }
    if (path === '/app/deliveries') {
      return <ClientDeliveries onSelectDelivery={(del) => setSelectedDelivery(del)} />
    }
    if (path === '/app/templates') {
      return <ClientTemplates />
    }
    if (path === '/app/event-types') {
      return <ClientEventTypes />
    }
    if (path === '/app/recipients') {
      return <ClientRecipients />
    }
    if (path === '/app/usage') {
      return <ClientUsage onNavigateToPlans={() => navigate('/app/plan')} />
    }
    if (path === '/app/api-keys') {
      return <ApiKeys />
    }
    if (path === '/app/plan') {
      return <ClientPlan />
    }
    if (path === '/app/profile') {
      return <ClientProfile />
    }

    // Admin Console Routes
    if (path === '/admin' || path === '/admin/' || path === '/admin/overview') {
      return (
        <AdminOverview
          onSelectClient={(c) => {
            navigate(`/admin/clients/${c.id}`)
          }}
        />
      )
    }

    const clientDetailMatch = matchRoute('/admin/clients/:id', path)
    if (clientDetailMatch) {
      return (
        <AdminClientDetail
          clientId={clientDetailMatch.id}
          onBack={() => navigate('/admin/clients')}
        />
      )
    }

    if (path === '/admin/clients') {
      return (
        <AdminClients
          onSelectClient={(c) => navigate(`/admin/clients/${c.id}`)}
        />
      )
    }
    if (path === '/admin/plans') {
      return <AdminPlans />
    }
    if (path === '/admin/health') {
      return <AdminSystemHealth />
    }
    if (path === '/admin/audit-log') {
      return <AdminAuditLog />
    }
    if (path === '/admin/settings') {
      return <AdminSettings />
    }

    // Fallback 404
    return <NotFound />
  }

  return (
    <>
      <Layout>
        {renderContent()}
      </Layout>

      <DeliveryDetailModal
        delivery={selectedDelivery}
        onClose={() => setSelectedDelivery(null)}
        onRetried={() => setSelectedDelivery(null)}
      />
    </>
  )
}

export default App
