import React, { useState } from 'react'
import { useAuth } from './auth'
import { useRoute } from './router'
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
import { ClientProfilePlan } from './views/client/ClientProfilePlan'

// Admin Views (Full Real Interactive Views)
import { AdminOverview } from './views/admin/AdminOverview'
import { AdminClients } from './views/admin/AdminClients'
import { AdminClientDetail } from './views/admin/AdminClientDetail'
import { AdminPlans } from './views/admin/AdminPlans'
import { AdminPayments } from './views/admin/AdminPayments'
import { AdminSystemHealth } from './views/admin/AdminSystemHealth'
import { AdminAuditLog } from './views/admin/AdminAuditLog'
import { AdminSettings } from './views/admin/AdminSettings'

// Global Modals
import { SendEventModal } from './components/SendEventModal'
import { DeliveryDetailModal } from './components/DeliveryDetailModal'

export function App() {
  const { status, user } = useAuth()
  const { path, navigate } = useRoute()

  // Modal & Detail states
  const [isSendEventOpen, setIsSendEventOpen] = useState(false)
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
      return <ClientUsage onNavigateToPlans={() => navigate('/app/profile')} />
    }
    if (path === '/app/api-keys') {
      return <ApiKeys onOpenSendEventModal={() => setIsSendEventOpen(true)} />
    }
    if (path === '/app/profile') {
      return <ClientProfilePlan />
    }

    // Admin Console Routes
    if (path === '/admin' || path === '/admin/' || path === '/admin/overview') {
      return (
        <AdminOverview
          onSelectClient={(c) => {
            setSelectedAdminClient(c)
            navigate('/admin/clients')
          }}
        />
      )
    }
    if (path === '/admin/clients') {
      return selectedAdminClient ? (
        <AdminClientDetail
          client={selectedAdminClient}
          onBack={() => setSelectedAdminClient(null)}
        />
      ) : (
        <AdminClients onSelectClient={(c) => setSelectedAdminClient(c)} />
      )
    }
    if (path === '/admin/plans') {
      return <AdminPlans />
    }
    if (path === '/admin/payments') {
      return <AdminPayments />
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
      <Layout onOpenSendEventModal={() => setIsSendEventOpen(true)}>
        {renderContent()}
      </Layout>

      {/* Global Interactive Modals */}
      <SendEventModal
        isOpen={isSendEventOpen}
        onClose={() => setIsSendEventOpen(false)}
        onEventSent={() => {}}
      />

      <DeliveryDetailModal
        delivery={selectedDelivery}
        onClose={() => setSelectedDelivery(null)}
        onRetried={() => setSelectedDelivery(null)}
      />
    </>
  )
}

export default App
