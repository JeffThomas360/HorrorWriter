import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Atmospherics from './Atmospherics'
import Nav from './Nav'
import Footer from './Footer'

export default function Layout() {
  const [signinOpen, setSigninOpen] = useState(false)

  return (
    <>
      <Atmospherics />
      <Nav onSignInClick={() => setSigninOpen(true)} />
      <main className="shell">
        <Outlet context={{ openSignin: () => setSigninOpen(true) }} />
      </main>
      <Footer />
      {/* SignInModal is wired in Task 26 */}
    </>
  )
}
