import { ReactNode } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthContext } from '../hooks/useAuth'

interface LayoutProps {
  children: ReactNode
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  )
}

const navItems = [
  {
    to: '/',
    label: 'Dashboard',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    end: true,
  },
  {
    to: '/sessions/new',
    label: 'New',
    icon: 'M12 4v16m8-8H4',
    end: false,
  },
  {
    to: '/repositories',
    label: 'Repos',
    icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
    end: false,
  },
  {
    to: '/profiles',
    label: 'Agents',
    icon: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',
    end: false,
  },
  {
    to: '/audit',
    label: 'Logs',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    end: false,
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    end: false,
  },
]

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/sessions/new': 'New Session',
  '/repositories': 'Repositories',
  '/profiles': 'Agent Profiles',
  '/audit': 'Audit Log',
  '/settings': 'Settings',
}

export function Layout({ children }: LayoutProps) {
  const { logout, user } = useAuthContext()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const pageTitle = Object.entries(PAGE_TITLES).find(
    ([path]) => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  )?.[1] ?? 'CloudCode'

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 h-14 flex items-center px-4">
        <div className="flex-1 flex items-center gap-2">
          <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 9l3 3-3 3m5 0h3" />
            </svg>
          </div>
          <span className="text-zinc-100 font-bold tracking-tight">CloudCode</span>
          {pageTitle !== 'CloudCode' && (
            <>
              <span className="text-zinc-700 font-light">/</span>
              <span className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest truncate max-w-[120px]">{pageTitle}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden sm:flex items-center gap-2 bg-zinc-800/50 px-2 py-1 rounded-full border border-zinc-700/50">
              <div className="w-4 h-4 rounded-full bg-zinc-600 flex items-center justify-center text-[8px] font-bold">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <span className="text-[10px] text-zinc-400 font-medium">{user.username}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center justify-center text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 w-10 h-10 rounded-full transition-all duration-200 tap-feedback border border-zinc-700/50"
            title="Logout"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 pt-14 pb-16 overflow-x-hidden">
        <div className="max-w-2xl mx-auto w-full animate-fade-in">
          {children}
        </div>
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900/90 backdrop-blur-md border-t border-zinc-800 h-16 flex items-center px-2">
        <div className="flex w-full max-w-2xl mx-auto gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-1 gap-0.5 rounded-xl transition-all duration-200 tap-feedback ${
                  isActive
                    ? 'text-indigo-400 bg-indigo-500/5'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`
              }
            >
              <div className={`transition-transform duration-200 ${location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to)) ? 'scale-110' : 'scale-100'}`}>
                <NavIcon d={item.icon} />
              </div>
              <span className="text-[10px] font-semibold tracking-wide uppercase">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
