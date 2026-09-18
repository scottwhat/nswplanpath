import type { QueryClient } from '@tanstack/react-query'
import { Link, Outlet, createRootRouteWithContext } from '@tanstack/react-router'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/pathways', label: 'Planning pathways explained' },
  { to: '/data', label: 'Data and legislation' },
  { to: '/tech', label: 'Tech' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
] as const

function RootLayout() {
  return (
    <div className="deep-field flex min-h-screen flex-col text-navy-900">
      <header className="rule-beam sticky top-0 z-30 border-b border-navy-200/70 bg-white/80 backdrop-blur-xl">
        <div className="border-b border-orange-600/40 bg-orange-500">
          <div className="mx-auto max-w-7xl px-6 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
            Early beta release
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <Link to="/" className="flex items-center gap-3" aria-label="PlanPath home">
            <Mark />
            <span className="text-lg font-semibold tracking-tight text-navy-990">
              PlanPath
            </span>
          </Link>

          <nav aria-label="Primary" className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === '/' }}
                className="rounded-sm px-3 py-1.5 text-sm text-navy-700 transition hover:bg-white/70 hover:text-navy-990"
                activeProps={{
                  className:
                    'rounded-sm px-3 py-1.5 text-sm font-medium text-beam-800 bg-beam-500/10 ring-1 ring-inset ring-beam-600/25',
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <span className="readout ml-auto flex items-center gap-2 rounded-full border border-beam-600/30 bg-beam-500/8 px-3 py-1.5">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-beam-600" aria-hidden="true" />
            Prototype
          </span>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <Outlet />
      </main>

      <footer className="relative z-10 border-t border-navy-200/70 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 py-5 text-[11px] leading-relaxed text-navy-700">
          <span className="readout mr-2">Source</span>
          Lot boundaries: NSW Digital Cadastral Database (Spatial Services). Not planning
          advice — a s10.7 Planning Certificate and the consent authority are authoritative.
        </div>
      </footer>
    </div>
  )
}

/* Concentric rings with a cyan core — a beacon, not a logo. */
function Mark() {
  return (
    <span className="relative grid h-7 w-7 place-items-center" aria-hidden="true">
      <span className="absolute inset-0 rounded-full border border-beam-600/35" />
      <span className="absolute inset-1.5 rounded-full border border-beam-600/60" />
      <span className="glow-beam h-1.5 w-1.5 rounded-full bg-beam-600" />
    </span>
  )
}
