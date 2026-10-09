/**
 * Unified API Client for NotifyHub
 * Supports both direct session request() calls and structured api.* helper methods.
 * Always sends credentials: 'include' for session cookie transport,
 * and attaches X-Requested-With: 'notifyhub-console' on non-GET calls for CSRF protection.
 */

const STORAGE_CLIENT_KEY = 'notifyhub_client_api_key'
const STORAGE_ADMIN_KEY = 'notifyhub_admin_api_key'
const STORAGE_ROLE = 'notifyhub_active_role'
const STORAGE_CLIENT_INFO = 'notifyhub_client_info'
const STORAGE_AUDIT_LOGS = 'notifyhub_audit_logs'

export const DEFAULT_CLIENT_KEY = 'nh_live_fakeshop_demo_key_secret_9999999999'
export const DEFAULT_ADMIN_KEY = 'admin_master_secret_key_12345'

export function getClientKey() {
  return localStorage.getItem(STORAGE_CLIENT_KEY) || DEFAULT_CLIENT_KEY
}

export function setClientKey(key) {
  if (key) localStorage.setItem(STORAGE_CLIENT_KEY, key.trim())
  else localStorage.removeItem(STORAGE_CLIENT_KEY)
}

export function getAdminKey() {
  return localStorage.getItem(STORAGE_ADMIN_KEY) || DEFAULT_ADMIN_KEY
}

export function setAdminKey(key) {
  if (key) localStorage.setItem(STORAGE_ADMIN_KEY, key.trim())
  else localStorage.removeItem(STORAGE_ADMIN_KEY)
}

export function getActiveRole() {
  return localStorage.getItem(STORAGE_ROLE) || null
}

export function setActiveRole(role) {
  if (role) localStorage.setItem(STORAGE_ROLE, role)
  else localStorage.removeItem(STORAGE_ROLE)
}

export function getClientInfo() {
  try {
    const raw = localStorage.getItem(STORAGE_CLIENT_INFO)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setClientInfo(info) {
  if (info) localStorage.setItem(STORAGE_CLIENT_INFO, JSON.stringify(info))
  else localStorage.removeItem(STORAGE_CLIENT_INFO)
}

export function clearSession() {
  localStorage.removeItem(STORAGE_ROLE)
  localStorage.removeItem(STORAGE_CLIENT_INFO)
}

export function getAuditLogs() {
  try {
    const raw = localStorage.getItem(STORAGE_AUDIT_LOGS)
    return raw
      ? JSON.parse(raw)
      : [
          { when: '10:42', who: 'Admin', action: 'Provisioned new tenant client', client: 'Acme Commerce', category: 'Clients' },
          { when: '09:15', who: 'System', action: 'Rotated API key', client: 'FakeShop', category: 'Security' },
          { when: 'Yesterday', who: 'Admin', action: 'Updated rate limits to 100/s', client: 'Tenant A', category: 'Rate limits' },
        ]
  } catch {
    return []
  }
}

export function addAuditLog(entry) {
  try {
    const logs = getAuditLogs()
    const newEntry = {
      when: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      who: 'Admin',
      ...entry,
    }
    const updated = [newEntry, ...logs].slice(0, 50)
    localStorage.setItem(STORAGE_AUDIT_LOGS, JSON.stringify(updated))
    return updated
  } catch {
    return []
  }
}

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const headers = { ...options.headers }

  if (method !== 'GET') {
    headers['X-Requested-With'] = 'notifyhub-console'
  }

  let body = options.body
  if (body !== undefined && body !== null && typeof body !== 'string') {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(body)
  } else if (typeof body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(path, {
    method,
    headers,
    body,
    credentials: 'include',
  })

  if (response.status === 204) {
    return null
  }

  const contentType = response.headers.get('content-type') || ''
  let data = null

  if (contentType.includes('application/json')) {
    try {
      data = await response.json()
    } catch {
      data = null
    }
  } else {
    data = await response.text()
  }

  if (!response.ok) {
    let message = 'An unexpected error occurred'
    if (data && typeof data === 'object') {
      if (typeof data.detail === 'string') {
        message = data.detail
      } else if (Array.isArray(data.detail)) {
        message = data.detail.map((err) => err.msg || JSON.stringify(err)).join(', ')
      } else if (data.message) {
        message = data.message
      }
    } else if (typeof data === 'string' && data.length > 0) {
      message = data
    } else {
      message = `Request failed with status ${response.status}`
    }

    throw new ApiError(message, response.status, data)
  }

  return data
}

/**
 * Structured API helper methods returning { ok: boolean, data?: any, error?: string }
 */
export const api = {
  // Common
  async getHealth() {
    try {
      const data = await request('/api/health')
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async getMe() {
    try {
      // First try /console/auth/me (session based)
      const data = await request('/console/auth/me')
      return { ok: true, data: data.client || data.user }
    } catch {
      try {
        const data = await request('/api/me', {
          headers: { 'X-API-Key': getClientKey() },
        })
        return { ok: true, data }
      } catch (err) {
        return { ok: false, error: err.message, status: err.status }
      }
    }
  },

  async getClientIdentity() {
    try {
      const data = await request('/console/client')
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async updateClientIdentity(payload) {
    try {
      const data = await request('/console/client', {
        method: 'PATCH',
        body: payload,
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  // Client Endpoints
  async getClientMetrics() {
    try {
      const data = await request('/api/metrics', {
        headers: { 'X-API-Key': getClientKey() },
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async getDeliveries(params = {}) {
    try {
      const query = new URLSearchParams()
      if (params.status) query.append('status', params.status)
      if (params.limit) query.append('limit', params.limit)
      if (params.offset) query.append('offset', params.offset)
      const qs = query.toString() ? `?${query.toString()}` : ''
      const data = await request(`/api/deliveries${qs}`, {
        headers: { 'X-API-Key': getClientKey() },
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async getDelivery(id) {
    try {
      const data = await request(`/api/deliveries/${id}`, {
        headers: { 'X-API-Key': getClientKey() },
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async retryDelivery(id) {
    try {
      const data = await request(`/api/deliveries/${id}/retry`, {
        method: 'POST',
        headers: { 'X-API-Key': getClientKey() },
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async getTemplates() {
    try {
      const data = await request('/api/templates', {
        headers: { 'X-API-Key': getClientKey() },
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async previewTemplate(subject, body, sample_data) {
    try {
      const data = await request('/api/templates/preview', {
        method: 'POST',
        headers: { 'X-API-Key': getClientKey() },
        body: { subject, body, sample_data },
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async createTemplate(name, subject, body) {
    try {
      const data = await request('/api/templates', {
        method: 'POST',
        headers: { 'X-API-Key': getClientKey() },
        body: { event_type: name, subject, body },
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async activateTemplate(id) {
    try {
      const data = await request(`/api/templates/${id}/activate`, {
        method: 'POST',
        headers: { 'X-API-Key': getClientKey() },
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async getEventTypes() {
    try {
      const data = await request('/api/event-types', {
        headers: { 'X-API-Key': getClientKey() },
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async createEventType(payload) {
    try {
      const eventType = payload.event_type || payload.name
      const data = await request(`/api/event-types/${eventType}`, {
        method: 'PUT',
        headers: { 'X-API-Key': getClientKey() },
        body: {
          priority: payload.priority ?? 1,
          ttl_seconds: payload.ttl_seconds ?? null,
          retry_schedule: payload.retry_schedule ?? [5, 10, 20, 40],
          respect_opt_out: payload.opt_out ?? payload.respect_opt_out ?? true,
          sensitive: payload.sensitive ?? false,
        },
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async getRecipients() {
    try {
      const data = await request('/api/recipients', {
        headers: { 'X-API-Key': getClientKey() },
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async upsertRecipient(externalId, payload) {
    try {
      const data = await request(`/api/recipients/${encodeURIComponent(externalId)}`, {
        method: 'PUT',
        headers: { 'X-API-Key': getClientKey() },
        body: payload,
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async updateRecipientPreference(externalId, eventType, enabled) {
    try {
      const data = await request(`/api/recipients/${encodeURIComponent(externalId)}/preferences`, {
        method: 'PUT',
        headers: { 'X-API-Key': getClientKey() },
        body: { event_type: eventType, enabled },
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async sendEvent(payload, idempotencyKey) {
    try {
      const data = await request('/api/events', {
        method: 'POST',
        headers: {
          'X-API-Key': getClientKey(),
          'Idempotency-Key': idempotencyKey || `event_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        },
        body: payload,
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  // Admin Endpoints
  async getAdminMetrics(clientId = null) {
    try {
      const url = clientId ? `/admin/metrics?client_id=${clientId}` : '/admin/metrics'
      const data = await request(url, {
        headers: { 'X-Admin-Key': getAdminKey() },
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async getClients() {
    try {
      const data = await request('/admin/clients', {
        headers: { 'X-Admin-Key': getAdminKey() },
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async createClient(payload) {
    try {
      const data = await request('/admin/clients', {
        method: 'POST',
        headers: { 'X-Admin-Key': getAdminKey() },
        body: payload,
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async updateClientStatus(id, newStatus) {
    try {
      const data = await request(`/admin/clients/${id}`, {
        method: 'PATCH',
        headers: { 'X-Admin-Key': getAdminKey() },
        body: { status: newStatus },
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },

  async rotateClientKey(id) {
    try {
      const data = await request(`/admin/clients/${id}/rotate-key`, {
        method: 'POST',
        headers: { 'X-Admin-Key': getAdminKey() },
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.message, status: err.status }
    }
  },
}
