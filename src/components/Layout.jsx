import { useState, Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Toaster } from 'sonner'
import Atmospherics from './Atmospherics'
import Nav from './Nav'
import Footer from './Footer'
import SignInModal from './SignInModal'
import OnboardingBanner from './OnboardingBanner'

export default function Layout() {
  const [signinOpen, setSigninOpen] = useState(false)

  const location = useLocation()

  return (
    <div className="app-layout">
      <Toaster 
        theme="dark" 
        position="bottom-right" 
        toastOptions={{ 
          style: { background: 'var(--ink-2)', border: '1px solid var(--blood)', color: 'var(--bone)', fontFamily: 'var(--ui)' } 
        }} 
      />
      <header className="control-deck">
        <Nav onSignInClick={() => setSigninOpen(true)} />
      </header>

      <div className="content-viewport">
        <OnboardingBanner />
        <main className="shell">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
              style={{ display: 'flex', flexDirection: 'column', flex: 1 }}
            >
              <Suspense fallback={
                <section className="surface active">
                  <div className="status-panel">
                    <p className="eyebrow">▸ Materializing…</p>
                  </div>
                </section>
              }>
                <Outlet context={{ openSignin: () => setSigninOpen(true) }} />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
        <Footer />
      </div>

      <SignInModal isOpen={signinOpen} onClose={() => setSigninOpen(false)} />
      <Atmospherics />
    </div>
  )
}
