import { useState, useRef, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeRaw from 'rehype-raw'
import { parseFileToMarkdown } from '../lib/fileParser'
import { playTypewriterKey, setAmbientSound, getCurrentAmbientType } from '../lib/soundscapes'

const TOOL_BTN =
  'relative flex h-8 w-8 items-center justify-center border border-transparent text-sm text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-line)] hover:text-[var(--color-text-primary)] disabled:pointer-events-none disabled:opacity-30'

function ToolButton({ label, onClick, disabled, children, className = '' }) {
  return (
    <span className="group/tip relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`${TOOL_BTN} ${className}`}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)] opacity-0 transition-opacity duration-100 group-hover/tip:opacity-100 shadow-md"
      >
        {label}
      </span>
    </span>
  )
}

function getWordMilestone(count) {
  if (count >= 2500) return { label: 'Grimoire', badge: '🩸 2,500w+', color: 'text-[var(--color-ember)]' }
  if (count >= 1000) return { label: 'Blaze', badge: '⚡ 1,000w', color: 'text-amber-400' }
  if (count >= 500)  return { label: 'Flame', badge: '🔥 500w', color: 'text-amber-500' }
  if (count >= 250)  return { label: 'Spark', badge: '🕯️ 250w', color: 'text-[var(--color-upside)]' }
  return { label: 'Kindling', badge: `${count} words`, color: 'text-[var(--color-text-secondary)]' }
}

export default function MarkdownEditor({
  value = '',
  onChange,
  placeholder = 'Speak into the void...',
  rows = 10,
  disabled = false,
}) {
  const [viewMode, setViewMode] = useState('write') // 'write' | 'split' | 'preview'
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [typewriterAudio, setTypewriterAudio] = useState(false)
  const [ambientAudio, setAmbientAudio] = useState('off')

  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)

  const wordCount = useMemo(() => {
    if (!value || typeof value !== 'string') return 0
    const matches = value.trim().match(/\S+/g)
    return matches ? matches.length : 0
  }, [value])

  const milestone = getWordMilestone(wordCount)

  const handleKeyDown = (e) => {
    if (typewriterAudio && !disabled && viewMode !== 'preview') {
      if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Meta') {
        playTypewriterKey(e.key === 'Enter')
      }
    }
  }

  const toggleTypewriterAudio = () => {
    const next = !typewriterAudio
    setTypewriterAudio(next)
    if (next) {
      playTypewriterKey(false)
    }
  }

  const handleAmbientChange = (e) => {
    const mode = e.target.value
    setAmbientAudio(mode)
    setAmbientSound(mode)
  }

  const insertText = (before, after = '') => {
    if (!textareaRef.current) return
    const el = textareaRef.current
    const start = el.selectionStart
    const end = el.selectionEnd
    const text = el.value
    const selectedText = text.substring(start, end)
    
    const newText = text.substring(0, start) + before + selectedText + after + text.substring(end)
    onChange({ target: { value: newText } })
    
    // Focus and restore cursor
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + before.length, end + before.length)
    }, 0)
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setIsUploading(true)
    setUploadError(null)
    try {
      const markdown = await parseFileToMarkdown(file)
      const newText = value ? value + '\n\n' + markdown : markdown
      onChange({ target: { value: newText } })
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const isEditorDisabled = disabled || viewMode === 'preview'

  return (
    <div
      className={`md-editor w-full border border-[var(--color-line)] bg-[var(--color-void)] transition-colors focus-within:border-[var(--color-blood)] ${disabled ? 'opacity-60' : ''}`}
    >
      {/* RTF Toolbar */}
      <div className="md-toolbar flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5">
        <div className="md-tools flex items-center flex-wrap gap-0.5">
          {/* Text Styling */}
          <ToolButton label="Bold (**text**)" onClick={() => insertText('**', '**')} disabled={isEditorDisabled}>
            <span className="font-bold">B</span>
          </ToolButton>
          <ToolButton label="Italic (*text*)" onClick={() => insertText('*', '*')} disabled={isEditorDisabled}>
            <span className="italic">I</span>
          </ToolButton>
          <ToolButton label="Underline (<u>text</u>)" onClick={() => insertText('<u>', '</u>')} disabled={isEditorDisabled}>
            <span className="underline">U</span>
          </ToolButton>
          <ToolButton label="Strikethrough (~~text~~)" onClick={() => insertText('~~', '~~')} disabled={isEditorDisabled}>
            <span className="line-through">S</span>
          </ToolButton>
          <ToolButton label="Highlight (<mark>text</mark>)" onClick={() => insertText('<mark>', '</mark>')} disabled={isEditorDisabled}>
            <span className="bg-amber-400/30 text-amber-200 px-1 rounded-xs text-xs font-mono font-bold">H</span>
          </ToolButton>

          <div className="md-divider mx-1 h-5 w-px bg-[var(--color-line)]" />

          {/* Headings */}
          <ToolButton label="Heading 1 (#)" onClick={() => insertText('# ')} disabled={isEditorDisabled}>
            <span className="font-mono font-bold text-xs">H1</span>
          </ToolButton>
          <ToolButton label="Heading 2 (##)" onClick={() => insertText('## ')} disabled={isEditorDisabled}>
            <span className="font-mono font-bold text-xs">H2</span>
          </ToolButton>
          <ToolButton label="Heading 3 (###)" onClick={() => insertText('### ')} disabled={isEditorDisabled}>
            <span className="font-mono font-bold text-xs">H3</span>
          </ToolButton>

          <div className="md-divider mx-1 h-5 w-px bg-[var(--color-line)]" />

          {/* Story RTF Helpers: Scene break & Dialogue Em-Dash */}
          <ToolButton label="Scene Break (* * *)" onClick={() => insertText('\n\n* * *\n\n')} disabled={isEditorDisabled}>
            <span className="font-mono text-xs tracking-widest">***</span>
          </ToolButton>
          <ToolButton label="Dialogue Em-Dash (—)" onClick={() => insertText('— ')} disabled={isEditorDisabled}>
            <span className="font-serif font-bold text-xs">—</span>
          </ToolButton>
          <ToolButton label="Blockquote (>)" onClick={() => insertText('> ')} disabled={isEditorDisabled}>
            <span className="text-base leading-none">&quot;</span>
          </ToolButton>

          <div className="md-divider mx-1 h-5 w-px bg-[var(--color-line)]" />

          {/* Lists & Links */}
          <ToolButton label="Bullet List" onClick={() => insertText('- ')} disabled={isEditorDisabled}>
            <span className="font-mono text-xs">•</span>
          </ToolButton>
          <ToolButton label="Numbered List" onClick={() => insertText('1. ')} disabled={isEditorDisabled}>
            <span className="font-mono text-xs">1.</span>
          </ToolButton>
          <ToolButton label="Code" onClick={() => insertText('`', '`')} disabled={isEditorDisabled}>
            <span className="font-mono text-xs">{'</>'}</span>
          </ToolButton>
          <ToolButton label="Link" onClick={() => insertText('[', '](https://)')} disabled={isEditorDisabled}>
            <span aria-hidden="true">🔗</span>
          </ToolButton>

          <div className="md-divider mx-1 h-5 w-px bg-[var(--color-line)]" />

          {/* File Import */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".txt,.md,.markdown,.docx"
            className="hidden"
          />
          <ToolButton
            label="Import .txt, .md, or .docx"
            onClick={() => fileInputRef.current?.click()}
            disabled={isEditorDisabled || isUploading}
            className="w-auto gap-1.5 px-2 font-mono text-[11px] uppercase tracking-wide"
          >
            <span aria-hidden="true">{isUploading ? '⏳' : '📁'}</span>
            <span>{isUploading ? 'Parsing…' : 'Import'}</span>
          </ToolButton>
        </div>

        {/* Sensory Audio, Word Milestone & Mode Tabs */}
        <div className="flex items-center gap-3">
          {/* Audio Controls */}
          <div className="flex items-center gap-1.5 bg-[var(--color-void)] px-2 py-0.5 border border-[var(--color-line)] text-[11px] font-mono">
            <button
              type="button"
              onClick={toggleTypewriterAudio}
              title="Toggle tactile typewriter clicks while typing"
              className={`flex items-center gap-1 transition-colors px-1 py-0.5 ${
                typewriterAudio ? 'text-[var(--color-ember)] font-bold' : 'text-[var(--color-text-secondary)] hover:text-white'
              }`}
            >
              <span>⌨️</span>
              <span className="hidden sm:inline">{typewriterAudio ? 'Clicks: ON' : 'Clicks'}</span>
            </button>

            <span className="text-[var(--color-line)]">|</span>

            <select
              value={ambientAudio}
              onChange={handleAmbientChange}
              title="Select background sensory horror atmosphere"
              className="bg-transparent text-[var(--color-text-secondary)] hover:text-white cursor-pointer focus:outline-none text-[11px] py-0.5"
            >
              <option value="off" className="bg-[var(--color-surface)] text-[var(--color-text-primary)]">Audio: Off</option>
              <option value="tape" className="bg-[var(--color-surface)] text-[var(--color-text-primary)]">📻 Tape Hum</option>
              <option value="rain" className="bg-[var(--color-surface)] text-[var(--color-text-primary)]">🌧️ Night Rain</option>
            </select>
          </div>

          {/* Word Count Milestone */}
          <div
            title={`Current word count: ${wordCount} words`}
            className="hidden md:flex items-center gap-1.5 font-mono text-[11px] tracking-wide"
          >
            <span className={milestone.color}>{milestone.badge}</span>
          </div>

          {/* Write / Split / Preview View Mode Tabs */}
          <div className="md-modes flex border border-[var(--color-line)]">
            <button
              type="button"
              onClick={() => setViewMode('write')}
              aria-pressed={viewMode === 'write'}
              className={`px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                viewMode === 'write'
                  ? 'bg-[var(--color-blood)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              Write
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              aria-pressed={viewMode === 'split'}
              className={`border-l border-[var(--color-line)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                viewMode === 'split'
                  ? 'bg-[var(--color-blood)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              Split View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              aria-pressed={viewMode === 'preview'}
              className={`border-l border-[var(--color-line)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                viewMode === 'preview'
                  ? 'bg-[var(--color-blood)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              Preview
            </button>
          </div>
        </div>
      </div>

      {uploadError && (
        <div className="md-error border-b border-[var(--color-line)] bg-[var(--color-blood)]/10 px-3 py-2 font-mono text-xs text-[var(--color-ember)]">
          {uploadError}
        </div>
      )}

      {/* Editor Content Area */}
      {viewMode === 'write' && (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          aria-label={placeholder}
          className="md-textarea block w-full resize-y bg-transparent px-4 py-4 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none disabled:cursor-not-allowed font-serif text-base leading-relaxed selection:bg-[var(--color-blood)] selection:text-white"
        />
      )}

      {viewMode === 'preview' && (
        <div
          className={`md-preview prose-book prose prose-invert max-w-none overflow-y-auto px-6 py-6 ${
            rows >= 10 ? 'min-h-[18rem]' : 'min-h-[10rem]'
          }`}
        >
          {value ? (
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeRaw]}>
              {value}
            </ReactMarkdown>
          ) : (
            <span className="italic text-[var(--color-text-secondary)] font-serif">Nothing to preview yet… speak into the dark.</span>
          )}
        </div>
      )}

      {viewMode === 'split' && (
        <div className="md-split-grid w-full min-h-[18rem]">
          <div className="border-b md:border-b-0 md:border-r border-[var(--color-line)]">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={onChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={rows}
              disabled={disabled}
              aria-label={placeholder}
              className="md-textarea block w-full h-full resize-none bg-transparent px-4 py-4 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none disabled:cursor-not-allowed font-serif text-base leading-relaxed selection:bg-[var(--color-blood)] selection:text-white"
            />
          </div>
          <div className="md-preview prose-book prose prose-invert max-w-none overflow-y-auto px-6 py-4 bg-[var(--color-surface)]/30">
            {value ? (
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeRaw]}>
                {value}
              </ReactMarkdown>
            ) : (
              <span className="italic text-[var(--color-text-secondary)] font-serif text-sm">Live preview renders here as you type…</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

