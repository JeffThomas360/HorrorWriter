import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Atmospherics from './Atmospherics'
import Nav from './Nav'
import Footer from './Footer'
import SignInModal from './SignInModal'
import OnboardingBanner from './OnboardingBanner'

export default function Layout() {
  const [signinOpen, setSigninOpen] = useState(false)

  return (
    <div className="app-layout">
      <header className="control-deck">
        <Nav onSignInClick={() => setSigninOpen(true)} />
      </header>

      <div className="content-viewport">
        <OnboardingBanner />
        <main className="shell">
          <Outlet context={{ openSignin: () => setSigninOpen(true) }} />
        </main>
        <Footer />
      </div>

      <SignInModal isOpen={signinOpen} onClose={() => setSigninOpen(false)} />
      <Atmospherics />
    </div>
  )
}
