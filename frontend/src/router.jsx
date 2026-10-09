import React, { createContext, useContext, useEffect, useState } from 'react'

const RouterContext = createContext({
  path: '/',
  navigate: () => {},
})

const listeners = new Set()

export function navigate(path, replace = false) {
  if (replace) {
    window.history.replaceState({}, '', path)
  } else {
    window.history.pushState({}, '', path)
  }
  for (const listener of listeners) {
    listener(window.location.pathname)
  }
}

export function RouterProvider({ children }) {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname)
    }
    window.addEventListener('popstate', onPopState)

    const onCustomNav = (newPath) => {
      setPath(newPath)
    }
    listeners.add(onCustomNav)

    return () => {
      window.removeEventListener('popstate', onPopState)
      listeners.delete(onCustomNav)
    }
  }, [])

  return (
    <RouterContext.Provider value={{ path, navigate }}>
      {children}
    </RouterContext.Provider>
  )
}

export function useRoute() {
  return useContext(RouterContext)
}

/**
 * Matches a route pattern (e.g., '/admin/clients/:id') against a target path.
 * Returns an object with extracted parameters if matched, or null otherwise.
 */
export function matchRoute(pattern, currentPath) {
  if (!pattern || !currentPath) return null
  const patternSegments = pattern.split('/').filter(Boolean)
  const pathSegments = currentPath.split('/').filter(Boolean)

  if (patternSegments.length !== pathSegments.length) {
    return null
  }

  const params = {}
  for (let i = 0; i < patternSegments.length; i++) {
    const pSeg = patternSegments[i]
    const cSeg = pathSegments[i]
    if (pSeg.startsWith(':')) {
      params[pSeg.slice(1)] = decodeURIComponent(cSeg)
    } else if (pSeg !== cSeg) {
      return null
    }
  }
  return params
}

export function useParams(pattern) {
  const { path } = useRoute()
  if (!pattern) return {}
  return matchRoute(pattern, path) || {}
}

export function Link({ to, children, className = '', ...props }) {
  const { navigate } = useRoute()

  const handleClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    navigate(to)
  }

  return (
    <a href={to} onClick={handleClick} className={className} {...props}>
      {children}
    </a>
  )
}
