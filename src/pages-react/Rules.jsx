import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export default function Rules() {
  useDocumentTitle('The Codex')
  const { hash } = useLocation()

  useEffect(() => {
    if (hash) {
      const id = hash.replace('#', '')
      const element = document.getElementById(id)
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      }
    } else {
      window.scrollTo(0, 0)
    }
  }, [hash])

  return (
    <section className="surface active" style={{ maxWidth: 'var(--prose-w)', margin: '0 auto' }}>
      <p className="eyebrow">▸ Core Principles</p>
      <h2 className="title">The <em>Codex</em></h2>
      <p className="lede" style={{ marginBottom: 40 }}>
        The ancient law of our circle. Enter freely, write with power, critique with truth, and respect the boundaries of the craft.
      </p>

      <div className="rules-content" style={{ display: 'flex', flexDirection: 'column', gap: 48, fontFamily: 'var(--body)', fontSize: '1.2rem', lineHeight: 1.8 }}>
        
        {/* ── HOUSE RULES ── */}
        <article id="house-rules" style={{ borderTop: '1px solid var(--line)', paddingTop: 32 }}>
          <h3 style={{ fontFamily: 'var(--serif)', color: 'var(--paper)', fontSize: '1.6rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--blood)', fontFamily: 'var(--mono)', fontSize: '1.1rem' }}>I.</span>
            House Rules
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 16, color: 'var(--bone-soft)' }}>
            <li>
              <strong style={{ color: 'var(--paper)' }}>1. Absolute Creator Ownership.</strong> You own 100% of your copyright. By publishing here, you only grant the site a non-exclusive license to format and display your stories to other members.
            </li>
            <li>
              <strong style={{ color: 'var(--paper)' }}>2. Strictly 18+ Participation.</strong> This community is exclusively for adults. Stories and critiques may explore intense, unsettling, and mature themes. By using the site, you warrant that you are at least 18 years of age.
            </li>
            <li>
              <strong style={{ color: 'var(--paper)' }}>3. No Machine Generation.</strong> Every word published here must come from a human hand. We do not host, tolerate, or critique AI-generated content or machine algorithms.
            </li>
            <li>
              <strong style={{ color: 'var(--paper)' }}>4. Hidden Circle.</strong> Do not advertise this domain aggressively. Let the coven grow organically, by word of mouth and whispers in the dark.
            </li>
          </ul>
        </article>

        {/* ── CRITIQUE CODE ── */}
        <article id="critique-code" style={{ borderTop: '1px solid var(--line)', paddingTop: 32 }}>
          <h3 style={{ fontFamily: 'var(--serif)', color: 'var(--paper)', fontSize: '1.6rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--blood)', fontFamily: 'var(--mono)', fontSize: '1.1rem' }}>II.</span>
            The Critique Code
          </h3>
          <p style={{ color: 'var(--bone-soft)', marginBottom: 16 }}>
            Praise is warm, but constructive darkness is how we hone our tools. We operate under a single mandate:
          </p>
          <blockquote style={{ borderLeft: '3px solid var(--blood)', paddingLeft: 20, fontStyle: 'italic', color: 'var(--paper)', marginBottom: 20 }}>
            "Critique the art, respect the author."
          </blockquote>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 16, color: 'var(--bone-soft)' }}>
            <li>
              <strong style={{ color: 'var(--paper)' }}>Uncensored Analysis:</strong> Critiques can be blunt, direct, and critical of prose, characterization, pacing, or structure. We do not shield text from honest feedback.
            </li>
            <li>
              <strong style={{ color: 'var(--paper)' }}>The Red Line:</strong> Critique is directed at the writing, never the writer. Personal harassment, doxxing, hate speech, defamation, and real-world threats will result in immediate exile (account termination) from the circle.
            </li>
          </ul>
        </article>

        {/* ── CONTENT WARNINGS ── */}
        <article id="content-warnings" style={{ borderTop: '1px solid var(--line)', paddingTop: 32 }}>
          <h3 style={{ fontFamily: 'var(--serif)', color: 'var(--paper)', fontSize: '1.6rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--blood)', fontFamily: 'var(--mono)', fontSize: '1.1rem' }}>III.</span>
            Content Warnings
          </h3>
          <p style={{ color: 'var(--bone-soft)', marginBottom: 16 }}>
            We write horror. Fear is our medium. However, respect the reader's right to curate their distress:
          </p>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 16, color: 'var(--bone-soft)' }}>
            <li>
              <strong style={{ color: 'var(--paper)' }}>Mandatory Disclaimers:</strong> If your story contains heavy graphic elements (extreme violence, self-harm, body horror), please add a brief content warning (CW) at the start of your lede or pitch.
            </li>
            <li>
              <strong style={{ color: 'var(--paper)' }}>Reader Curation:</strong> Readers are expected to exercise personal autonomy and curate their own reading list. Enter stories with the understanding that horror is meant to provoke, disturb, and unsettle.
            </li>
          </ul>
        </article>

        {/* ── LEGAL & LIABILITY (DMCA / SECTION 230) ── */}
        <article id="liability-dmca" style={{ borderTop: '1px solid var(--line)', paddingTop: 32 }}>
          <h3 style={{ fontFamily: 'var(--serif)', color: 'var(--paper)', fontSize: '1.6rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--blood)', fontFamily: 'var(--mono)', fontSize: '1.1rem' }}>IV.</span>
            Legal & Liability Safe Harbors
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 16, color: 'var(--bone-soft)' }}>
            <li>
              <strong style={{ color: 'var(--paper)' }}>Section 230 Shield:</strong> As a provider of interactive computer services, the platform is not the publisher or speaker of any information provided by other information content providers. All liability for published content lies solely with the individual user who created it.
            </li>
            <li>
              <strong style={{ color: 'var(--paper)' }}>DMCA Takedown Agent:</strong> We respect intellectual property rights. If you believe your copyrighted work has been posted without authorization, please send a formal takedown notice complying with 17 U.S.C. § 512(c)(3) to our designated agent at <a href="mailto:abuse@horrorwriter.org" style={{ color: 'var(--cyan)', textDecoration: 'underline' }}>abuse@horrorwriter.org</a>.
            </li>
            <li>
              <strong style={{ color: 'var(--paper)' }}>Humorous Psychological Waiver:</strong> By signing in, you agree that Horror Writer is not liable for sleep deprivation, nightmares, structural paranoia, or the sudden realization that there is someone standing behind you.
            </li>
          </ul>
        </article>

        {/* ── PRIVACY POLICY ── */}
        <article id="privacy" style={{ borderTop: '1px solid var(--line)', paddingTop: 32, marginBottom: 48 }}>
          <h3 style={{ fontFamily: 'var(--serif)', color: 'var(--paper)', fontSize: '1.6rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--blood)', fontFamily: 'var(--mono)', fontSize: '1.1rem' }}>V.</span>
            Privacy of the Void
          </h3>
          <p style={{ color: 'var(--bone-soft)' }}>
            We collect only the bare minimum data required to authenticate you: your email address, your display settings, and your public contributions. We do not use trackers, cookies (other than for Supabase auth persistence), or external analytics. Your email is never sold, traded, or shared, unless required by legal subpoena.
          </p>
        </article>

      </div>
    </section>
  )
}
