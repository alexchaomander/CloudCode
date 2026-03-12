import { createContext, useContext, ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth, AuthState } from './hooks/useAuth'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Bootstrap } from './pages/Bootstrap'
import { Dashboard } from './pages/Dashboard'
import { NewSession } from './pages/NewSession'
import { SessionDetail } from './pages/SessionDetail'
import { Profiles } from './pages/Profiles'
import { Settings } from './pages/Settings'
import { AuditLog } from './pages/AuditLog'

// Auth context so child components can access auth state
const AuthContext = createContext<AuthState | null>(null)

export function useAuthContext(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}

function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

interface ProtectedRouteProps {
  children: ReactNode
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuthContext()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes (no Layout) */}
      <Route path="/login" element={<Login />} />
      <Route path="/bootstrap" element={<Bootstrap />} />

      {/* Protected routes wrapped in Layout */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sessions/new"
        element={
          <ProtectedRoute>
            <Layout>
              <NewSession />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sessions/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <SessionDetail />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profiles"
        element={
          <ProtectedRoute>
            <Layout>
              <Profiles />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Layout>
              <Settings />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit"
        element={
          <ProtectedRoute>
            <Layout>
              <AuditLog />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
