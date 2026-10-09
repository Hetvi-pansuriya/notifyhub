import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import './index.css'
import './App.css'
import { RouterProvider } from './router'
import { AuthProvider } from './auth'
import { ToastProvider } from './components/Toast'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </RouterProvider>
  </StrictMode>,
)
