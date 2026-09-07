import { useState } from 'react'

const PATINAS = [
  { id: 'blood', label: 'Blood Cut', spineBg: 'bg-[var(--color-blood)]', spineText: 'text-white', borderColor: 'border-[var(--color-blood)]' },
  { id: 'cyan',  label: 'Channel 13', spineBg: 'bg-[var(--color-upside)]', spineText: 'text-[var(--color-void)]', borderColor: 'border-[var(--color-upside)]' },
  { id: 'bone',  label: 'Grimoire Bone', spineBg: 'bg-[#E5E1D8]', spineText: 'text-[var(--color-void)]', borderColor: 'border-[#E5E1D8]' },
  { id: 'void',  label: 'Midnight Void', spineBg: 'bg-[var(--color-void)]', spineText: 'text-[var(--color-ember)]', borderColor: 'border-[var(--color-line)]' },
]

const STICKERS = [
  { id: 'rewind', label: 'Rewind Sticker', text: 'BE KIND • REWIND', bg: 'bg-amber-400 text-black shadow-sm' },
  { id: 'unrated', label: 'Unrated Cut', text: 'UNRATED BOOTLEG', bg: 'bg-[var(--color-blood)] text-white shadow-sm' },
  { id: 'archive', label: 'Archive Vault', text: 'VAULT · CH. 13', bg: 'bg-[var(--color-upside)] text-[var(--color-void)] shadow-sm' },
  { id: 'exrental', label: 'Ex-Rental', text: 'EX-RENTAL • $2.99', bg: 'bg-emerald-500 text-black shadow-sm' },
]

export default function VhsSleeveCustomizer({
  title = 'Untitled Horror Tape',
  author = 'anonymous',
  lede = 'The darkness watches from behind the screen.',
  cover = 'blood',
  sticker = 'rewind',
  onCoverChange,
  onStickerChange,
}) {
  const [activePatina, setActivePatina] = useState(cover || 'blood')
  const [activeSticker, setActiveSticker] = useState(sticker || 'rewind')

  const currentPatina = PATINAS.find(p => p.id === activePatina) || PATINAS[0]
  const currentSticker = STICKERS.find(s => s.id === activeSticker) || STICKERS[0]

  const handlePatinaSelect = (id) => {
    setActivePatina(id)
    if (onCoverChange) onCoverChange(id)
  }

  const handleStickerSelect = (id) => {
    setActiveSticker(id)
    if (onStickerChange) onStickerChange(id)
  }

  return (
    <div className="vhs-customizer flex flex-col gap-5 p-5 bg-[var(--color-surface)] border border-[var(--color-line)]">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-upside)] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--color-blood)] animate-pulse" />
          Live VHS Sleeve Preview
        </span>
        <span className="font-mono text-[10px] text-[var(--color-text-secondary)] uppercase">
          Tape Format: NTSC / SP
        </span>
      </div>

      {/* The 3D-styled physical cassette sleeve */}
      <div className="flex justify-center py-2">
        <div className="relative flex w-full max-w-sm aspect-[4/5] bg-[var(--color-void)] border-2 border-[var(--color-line)] shadow-2xl transition-transform duration-300 hover:scale-[1.02] overflow-hidden group">
          
          {/* Tape Spine (Left) */}
          <div
            className={`w-9 shrink-0 flex flex-col items-center justify-between py-4 border-r border-black/30 select-none ${currentPatina.spineBg} ${currentPatina.spineText}`}
          >
            <span className="font-mono text-[8px] uppercase tracking-wider font-black rotate-180 [writing-mode:vertical-rl]">
              HW-VHS-01
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest font-black rotate-180 [writing-mode:vertical-rl] truncate max-h-[180px]">
              {title || 'UNTITLED TAPE'}
            </span>
            <span className="font-mono text-[8px] uppercase font-bold tracking-tighter">
              HI-FI
            </span>
          </div>

          {/* Sleeve Face (Right) */}
          <div className="flex-1 flex flex-col justify-between p-5 bg-[var(--color-surface)] relative overflow-hidden">
            {/* Retro CRT scanlines overlay */}
            <div
              className="pointer-events-none absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 2px)',
                backgroundSize: '100% 2px'
              }}
            />

            {/* Corner Rental Sticker */}
            <div className="absolute top-3 right-3 z-10">
              <span className={`inline-block font-mono text-[9px] font-black uppercase tracking-wider px-2 py-1 rotate-2 transform ${currentSticker.bg}`}>
                {currentSticker.text}
              </span>
            </div>

            {/* Header / Brand */}
            <div>
              <span className="block font-mono text-[9px] tracking-[0.25em] text-[var(--color-text-secondary)] uppercase mb-4">
                HORROR ARCHIVES • CH. 13
              </span>
              <h3 className="text-xl sm:text-2xl font-serif font-black leading-tight text-[var(--color-text-primary)] mb-2 group-hover:text-[var(--color-blood)] transition-colors line-clamp-3">
                {title || 'Enter your story title...'}
              </h3>
              <span className="block font-mono text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">
                By @{author || 'you'}
              </span>
            </div>

            {/* Lede / Back-Cover Blurb */}
            <p className="font-serif italic text-xs text-[var(--color-text-secondary)] line-clamp-3 leading-relaxed border-l-2 border-[var(--color-line)] pl-2.5 my-2">
              &ldquo;{lede || 'Every nightmare begins with a tape that should not exist.'}&rdquo;
            </p>

            {/* Bottom Tape Footer with Barcode */}
            <div className="flex items-end justify-between border-t border-[var(--color-line)] pt-3 mt-auto">
              <div className="flex flex-col">
                <span className="font-mono text-[8px] uppercase tracking-widest text-[var(--color-text-secondary)]">
                  STEREO SOUND
                </span>
                <span className="font-mono text-[7px] text-[var(--color-text-secondary)]">
                  APPROX. RUNNING TIME: READABLE
                </span>
              </div>

              {/* Pseudo Barcode */}
              <div className="font-mono text-[9px] tracking-widest text-[var(--color-text-secondary)] select-none opacity-80">
                ||| | |||| || ||| 13
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customizer Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[var(--color-line)] pt-4">
        {/* Patina Palette */}
        <div>
          <label className="block font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
            Tape Condition / Patina:
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PATINAS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePatinaSelect(p.id)}
                className={`px-2.5 py-1 font-mono text-xs uppercase border transition-colors cursor-pointer ${
                  activePatina === p.id
                    ? 'bg-[var(--color-blood)] text-white border-[var(--color-blood)]'
                    : 'bg-[var(--color-void)] text-[var(--color-text-secondary)] border-[var(--color-line)] hover:border-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Vintage Sticker */}
        <div>
          <label className="block font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
            Rental Sticker:
          </label>
          <div className="flex flex-wrap gap-1.5">
            {STICKERS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleStickerSelect(s.id)}
                className={`px-2.5 py-1 font-mono text-xs uppercase border transition-colors cursor-pointer ${
                  activeSticker === s.id
                    ? 'bg-[var(--color-upside)] text-[var(--color-void)] border-[var(--color-upside)] font-bold'
                    : 'bg-[var(--color-void)] text-[var(--color-text-secondary)] border-[var(--color-line)] hover:border-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
