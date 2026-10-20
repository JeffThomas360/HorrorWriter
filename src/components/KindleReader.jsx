import { useState, useEffect } from 'react'

/**
 * Kindle Focus Mode: the full-screen, distraction-free reader shared by
 * Library stories (ReadStory) and Ritual entries in The Crypt (ThreadView).
 *
 * useKindlePrefs() owns the reader's typography (persisted per browser under
 * hw_kindle_* / hw_reader_format) so the inline reader and Focus Mode agree.
 */
export function useKindlePrefs() {
  const [format, setFormatState] = useState('modern') // 'modern' | 'novel'
  const [theme, setTheme] = useState('void') // 'void' | 'sepia' | 'paper'
  const [font, setFont] = useState('bookerly') // 'bookerly' | 'literata' | 'sans' | 'mono'
  const [size, setSize] = useState(18) // 16, 18, 20, 22, 26
  const [width, setWidth] = useState('normal') // 'narrow' | 'normal' | 'wide'
  const [spacing, setSpacing] = useState('normal') // 'compact' | 'normal' | 'relaxed'

  useEffect(() => {
    try {
      const f = localStorage.getItem('hw_reader_format')
      if (f) setFormatState(f)
      const t = localStorage.getItem('hw_kindle_theme')
      if (t) setTheme(t)
      const fo = localStorage.getItem('hw_kindle_font')
      if (fo) setFont(fo)
      const sz = localStorage.getItem('hw_kindle_size')
      if (sz) {
        setSize(Number(sz))
      } else if (typeof window !== 'undefined' && window.innerWidth < 768) {
        // 18px on a 375px screen is ~30 characters a line; comfortable measure
        // is 45-75. Start narrow screens a step down; once chosen it persists.
        setSize(16)
      }
      const w = localStorage.getItem('hw_kindle_width')
      if (w) setWidth(w)
      const sp = localStorage.getItem('hw_kindle_spacing')
      if (sp) setSpacing(sp)
    } catch {
      // Ignore localStorage errors
    }
  }, [])

  const setters = { theme: setTheme, font: setFont, size: setSize, width: setWidth, spacing: setSpacing }

  function update(key, value) {
    setters[key](value)
    try {
      localStorage.setItem(`hw_kindle_${key}`, String(value))
    } catch {}
  }

  function setFormat(mode) {
    setFormatState(mode)
    try {
      localStorage.setItem('hw_reader_format', mode)
    } catch {}
  }

  return { format, theme, font, size, width, spacing, update, setFormat }
}

/**
 * Props:
 *  prefs       from useKindlePrefs()
 *  onExit      leave Focus Mode (also bound to Esc)
 *  hudTitle    centred in the top bar
 *  eyebrow     small line above the title ("A story by …")
 *  title, lede header text; title may be omitted
 *  children    the prose
 *  endNote     optional node under "~ Finis ~" (e.g. copyright)
 *  exitLabel   label for the end-of-text exit button
 *  footerLeft  bottom-left HUD text (author)
 *  wordCount   drives the minutes-left estimate
 *  onNext, nextLabel  optional "read the next one" button at the end
 */
export default function KindleReader({
  prefs, onExit, hudTitle, eyebrow, title, lede, children, endNote = null,
  exitLabel = 'Exit Kindle Mode', footerLeft, wordCount = 0, onNext, nextLabel,
}) {
  const [showSettings, setShowSettings] = useState(false)
  const [scrollPercent, setScrollPercent] = useState(0)

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setShowSettings(false)
        onExit()
      }
      if ((e.key === 't' || e.key === 'T') && !showSettings) {
        const themes = ['void', 'sepia', 'paper']
        prefs.update('theme', themes[(themes.indexOf(prefs.theme) + 1) % themes.length])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [prefs, showSettings, onExit])

  useEffect(() => {
    const el = document.getElementById('kindle-viewport')
    if (!el) return
    el.scrollTop = 0
    setScrollPercent(0)
    function handleScroll() {
      const max = el.scrollHeight - el.clientHeight
      if (max > 0) setScrollPercent(Math.min(100, Math.max(0, Math.round((el.scrollTop / max) * 100))))
    }
    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [title])

  const totalMins = Math.max(1, Math.ceil(wordCount / 200))
  const remainingMins = Math.max(0, Math.ceil(totalMins * (1 - scrollPercent / 100)))

  return (
    <div
      id="kindle-viewport"
      className={`kindle-immersive-mode kindle-theme-${prefs.theme} kindle-font-${prefs.font} kindle-leading-${prefs.spacing}`}
    >
      {/* Kindle Top HUD */}
      <header className="kindle-hud fixed top-0 inset-x-0 h-14 z-50 flex items-center justify-between px-4 sm:px-8 border-b backdrop-blur-md transition-all">
        <button
          type="button"
          onClick={() => {
            setShowSettings(false)
            onExit()
          }}
          className="flex items-center gap-2 px-3 py-1.5 border text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer"
          title="Exit Kindle Focus Mode (or press Esc)"
        >
          <span>←</span>
          <span>Exit Focus <kbd className="hidden sm:inline opacity-60 text-[10px] font-sans">[Esc]</kbd></span>
        </button>

        <div className="hidden md:block max-w-md truncate text-center font-serif italic text-sm opacity-80">
          {hudTitle}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-serif font-bold transition-colors cursor-pointer ${
              showSettings ? 'border-[var(--color-ember)] text-[var(--color-ember)]' : ''
            }`}
            title="Typography & Theme Settings (Aa)"
          >
            <span className="text-base leading-none">Aa</span>
            <span className="text-[11px] font-mono font-normal">Theme & Type</span>
          </button>

          {/* Floating Aa Popover */}
          {showSettings && (
            <div className="absolute right-0 top-12 w-80 sm:w-96 p-5 rounded-sm border shadow-2xl z-50 kindle-hud bg-[var(--color-surface)] text-[var(--color-text-primary)]">
              <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3 mb-4">
                <h3 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ember)]">Kindle Reader Settings</h3>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="font-mono text-xs opacity-60 hover:opacity-100 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Theme selection */}
              <div className="mb-4">
                <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
                  Reading Theme
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => prefs.update('theme', 'void')}
                    className={`py-2 px-2 border text-center transition-colors cursor-pointer ${
                      prefs.theme === 'void'
                        ? 'border-[var(--color-blood)] bg-black text-white ring-1 ring-[var(--color-blood)]'
                        : 'border-[var(--color-line)] bg-[#0a0a0c] text-neutral-400 hover:text-white'
                    }`}
                  >
                    🌑 Void Dark
                  </button>
                  <button
                    type="button"
                    onClick={() => prefs.update('theme', 'sepia')}
                    className={`py-2 px-2 border text-center transition-colors cursor-pointer ${
                      prefs.theme === 'sepia'
                        ? 'border-[#A33A2D] bg-[#F4EFEA] text-[#2B231D] font-bold ring-1 ring-[#A33A2D]'
                        : 'border-[var(--color-line)] bg-[#E8DFD8] text-[#5C4E43] hover:text-[#2B231D]'
                    }`}
                  >
                    📜 Sepia
                  </button>
                  <button
                    type="button"
                    onClick={() => prefs.update('theme', 'paper')}
                    className={`py-2 px-2 border text-center transition-colors cursor-pointer ${
                      prefs.theme === 'paper'
                        ? 'border-[#C8102E] bg-[#FAF9F6] text-[#1A1A1A] font-bold ring-1 ring-[#C8102E]'
                        : 'border-[var(--color-line)] bg-[#ECEBE4] text-[#4A4A4A] hover:text-[#1A1A1A]'
                    }`}
                  >
                    📄 Paper Light
                  </button>
                </div>
              </div>

              {/* Font family selection */}
              <div className="mb-4">
                <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
                  Font Family
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => prefs.update('font', 'bookerly')}
                    className={`py-1.5 px-3 border text-left font-serif transition-colors cursor-pointer ${
                      prefs.font === 'bookerly'
                        ? 'border-[var(--color-blood)] bg-[var(--color-void)] text-[var(--color-ember)] font-bold'
                        : 'border-[var(--color-line)] opacity-80 hover:opacity-100'
                    }`}
                  >
                    Bookerly (Classic)
                  </button>
                  <button
                    type="button"
                    onClick={() => prefs.update('font', 'literata')}
                    className={`py-1.5 px-3 border text-left font-serif transition-colors cursor-pointer ${
                      prefs.font === 'literata'
                        ? 'border-[var(--color-blood)] bg-[var(--color-void)] text-[var(--color-ember)] font-bold'
                        : 'border-[var(--color-line)] opacity-80 hover:opacity-100'
                    }`}
                  >
                    Literata (Editorial)
                  </button>
                  <button
                    type="button"
                    onClick={() => prefs.update('font', 'sans')}
                    className={`py-1.5 px-3 border text-left font-sans transition-colors cursor-pointer ${
                      prefs.font === 'sans'
                        ? 'border-[var(--color-blood)] bg-[var(--color-void)] text-[var(--color-ember)] font-bold'
                        : 'border-[var(--color-line)] opacity-80 hover:opacity-100'
                    }`}
                  >
                    Clean Sans
                  </button>
                  <button
                    type="button"
                    onClick={() => prefs.update('font', 'mono')}
                    className={`py-1.5 px-3 border text-left font-mono transition-colors cursor-pointer ${
                      prefs.font === 'mono'
                        ? 'border-[var(--color-blood)] bg-[var(--color-void)] text-[var(--color-ember)] font-bold'
                        : 'border-[var(--color-line)] opacity-80 hover:opacity-100'
                    }`}
                  >
                    Typewriter Mono
                  </button>
                </div>
              </div>

              {/* Font size step */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">Font Size</span>
                  <span className="font-mono text-xs text-[var(--color-ember)] font-bold">{prefs.size}px</span>
                </div>
                <div className="flex items-center gap-2">
                  {[16, 18, 20, 22, 26].map(sz => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => prefs.update('size', sz)}
                      className={`flex-1 py-1 border text-xs font-mono transition-colors cursor-pointer ${
                        prefs.size === sz
                          ? 'border-[var(--color-blood)] bg-[var(--color-blood)] text-white font-bold'
                          : 'border-[var(--color-line)] hover:border-white'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              {/* Margins & Spacing */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
                    Column Width
                  </label>
                  <div className="flex border border-[var(--color-line)]">
                    {[
                      { id: 'narrow', label: 'Narrow' },
                      { id: 'normal', label: 'Normal' },
                      { id: 'wide', label: 'Wide' },
                    ].map(w => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => prefs.update('width', w.id)}
                        className={`flex-1 py-1 font-mono text-[10px] uppercase transition-colors cursor-pointer ${
                          prefs.width === w.id
                            ? 'bg-[var(--color-blood)] text-white font-bold'
                            : 'hover:text-white'
                        }`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
                    Line Height
                  </label>
                  <div className="flex border border-[var(--color-line)]">
                    {[
                      { id: 'compact', label: 'Compact' },
                      { id: 'normal', label: 'Normal' },
                      { id: 'relaxed', label: 'Relaxed' },
                    ].map(sp => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => prefs.update('spacing', sp.id)}
                        className={`flex-1 py-1 font-mono text-[10px] uppercase transition-colors cursor-pointer ${
                          prefs.spacing === sp.id
                            ? 'bg-[var(--color-blood)] text-white font-bold'
                            : 'hover:text-white'
                        }`}
                      >
                        {sp.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Paragraph Formatting Mode */}
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
                  Paragraph Style
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => prefs.setFormat('modern')}
                    className={`py-1.5 px-2 border transition-colors cursor-pointer ${
                      prefs.format === 'modern'
                        ? 'border-[var(--color-blood)] bg-[var(--color-blood)] text-white font-bold'
                        : 'border-[var(--color-line)] hover:border-white'
                    }`}
                  >
                    ¶ Modern Spacing
                  </button>
                  <button
                    type="button"
                    onClick={() => prefs.setFormat('novel')}
                    className={`py-1.5 px-2 border transition-colors cursor-pointer ${
                      prefs.format === 'novel'
                        ? 'border-[var(--color-blood)] bg-[var(--color-blood)] text-white font-bold'
                        : 'border-[var(--color-line)] hover:border-white'
                    }`}
                  >
                    📖 Novel Indent
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Prose Container */}
      <main
        className={`kindle-width-${prefs.width} mx-auto pt-16 pb-24`}
        style={{ fontSize: `${prefs.size}px` }}
      >
        <div className="text-center pb-8 mb-10 border-b border-current opacity-70">
          {eyebrow && (
            <p className="font-mono text-xs uppercase tracking-widest mb-3 opacity-60">{eyebrow}</p>
          )}
          {title && (
            <h1 className="text-3xl md:text-5xl font-serif font-black tracking-tight mb-4 leading-tight">{title}</h1>
          )}
          {lede && (
            <p className="font-serif italic text-base md:text-lg opacity-80 max-w-xl mx-auto leading-relaxed">{lede}</p>
          )}
        </div>

        {children && (
          <article className={`prose-book prose max-w-none ${prefs.format === 'novel' ? 'format-novel' : ''}`}>
            {children}
          </article>
        )}

        <div className="mt-16 pt-8 border-t border-current opacity-40 text-center font-serif italic text-sm">
          <p className="mb-4">~ Finis ~</p>
          {endNote}
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setShowSettings(false)
                onExit()
              }}
              className="font-mono text-xs uppercase tracking-wider px-4 py-2 border border-current hover:opacity-100 transition-opacity cursor-pointer"
            >
              {exitLabel}
            </button>
            {onNext && (
              <button
                type="button"
                onClick={onNext}
                className="font-mono text-xs uppercase tracking-wider px-4 py-2 border border-current hover:opacity-100 transition-opacity cursor-pointer"
              >
                {nextLabel || 'Next →'}
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Bottom Sticky Telemetry HUD */}
      <footer className="kindle-hud fixed bottom-0 inset-x-0 h-10 z-50 flex items-center justify-between px-4 sm:px-8 border-t backdrop-blur-md text-xs font-mono select-none">
        <div className="flex items-center gap-2 opacity-70 truncate max-w-[40%]">
          <span>{footerLeft}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block w-24 sm:w-36 h-1.5 bg-neutral-700/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--color-blood)] transition-all duration-150"
              style={{ width: `${scrollPercent}%` }}
            />
          </div>
          <span className="font-bold">{scrollPercent}%</span>
        </div>

        <div className="opacity-70 text-right">
          <span>{remainingMins === 0 ? 'Complete' : `~${remainingMins} min left`}</span>
        </div>
      </footer>
    </div>
  )
}
