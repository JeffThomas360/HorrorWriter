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
    <>
      <Atmospherics />
      <Nav onSignInClick={() => setSigninOpen(true)} />
      <OnboardingBanner />
      <main className="shell">
        <Outlet context={{ openSignin: () => setSigninOpen(true) }} />
      </main>
      <Footer />
      <SignInModal isOpen={signinOpen} onClose={() => setSigninOpen(false)} />
    </>
  )
}
