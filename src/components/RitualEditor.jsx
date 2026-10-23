import { useEffect, useRef, useState } from 'react'
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { Placeholder } from '@tiptap/extensions'

/**
 * The Midnight Ritual writing box: a visual editor that stores Markdown.
 * Only what fiction needs is switched on (bold, italic, scene break, quote);
 * everything else StarterKit offers is off, so a response can't carry headings,
 * links or lists. The stored text stays Markdown, so existing entries and the
 * sanitising renderer are unchanged.
 */

const SIZES = [
  { label: 'Small', px: 16 },
  { label: 'Medium', px: 18 },
  { label: 'Large', px: 20 },
  { label: 'Extra large', px: 24 },
]
const DEFAULT_SIZE = 1
const SIZE_KEY = 'hw.ritual.fontSize'

function readSize() {
  try {
    const n = Number(window.localStorage.getItem(SIZE_KEY))
    return Number.isInteger(n) && n >= 0 && n < SIZES.length ? n : DEFAULT_SIZE
  } catch {
    return DEFAULT_SIZE
  }
}
function writeSize(n) {
  try {
    window.localStorage.setItem(SIZE_KEY, String(n))
  } catch {
    /* storage unavailable: the choice just lasts for this visit */
  }
}

const BTN =
  'flex h-8 min-w-8 items-center justify-center border px-2 font-mono text-xs transition-colors disabled:pointer-events-none disabled:opacity-30'
const btnClass = (on) =>
  `${BTN} ${
    on
      ? 'border-[var(--color-upside)] text-[var(--color-upside)]'
      : 'border-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-line)] hover:text-[var(--color-text-primary)]'
  }`

function Tool({ label, pressed, onClick, disabled, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={btnClass(pressed)}
    >
      {children}
    </button>
  )
}

export default function RitualEditor({ id, value, onChange, placeholder, disabled = false }) {
  const [sizeIndex, setSizeIndex] = useState(DEFAULT_SIZE)
  // The last Markdown this editor produced, so an echoed `value` isn't re-applied.
  const lastEmitted = useRef(value)

  useEffect(() => setSizeIndex(readSize()), [])

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        code: false,
        codeBlock: false,
        strike: false,
        link: false,
        underline: false,
      }),
      Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
      Placeholder.configure({ placeholder: placeholder || '' }),
    ],
    content: value || '',
    contentType: 'markdown',
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': placeholder || 'Your response',
      },
    },
    onUpdate: ({ editor: ed }) => {
      const md = ed.getMarkdown()
      lastEmitted.current = md
      onChange?.(md)
    },
  })

  // The box is controlled: when the parent swaps the text (tuning to another
  // channel, loading a saved draft) the editor follows.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return
    lastEmitted.current = value
    editor.commands.setContent(value || '', { contentType: 'markdown', emitUpdate: false })
  }, [editor, value])

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  const active = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: !!ed?.isActive('bold'),
      italic: !!ed?.isActive('italic'),
      quote: !!ed?.isActive('blockquote'),
    }),
  })

  const chooseSize = (n) => {
    const next = Math.min(SIZES.length - 1, Math.max(0, n))
    setSizeIndex(next)
    writeSize(next)
  }

  const size = SIZES[sizeIndex]

  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-void)] focus-within:border-[var(--color-upside)]">
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5"
      >
        <div className="flex items-center gap-0.5">
          <Tool label="Bold" pressed={!!active?.bold} disabled={disabled} onClick={() => editor?.chain().focus().toggleBold().run()}>
            <strong>B</strong>
          </Tool>
          <Tool label="Italic" pressed={!!active?.italic} disabled={disabled} onClick={() => editor?.chain().focus().toggleItalic().run()}>
            <em>I</em>
          </Tool>
          <Tool label="Scene break" disabled={disabled} onClick={() => editor?.chain().focus().setHorizontalRule().run()}>
            * * *
          </Tool>
          <Tool label="Block quote" pressed={!!active?.quote} disabled={disabled} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
            &ldquo;
          </Tool>
        </div>
        <div className="flex items-center gap-0.5" role="group" aria-label="Text size">
          <Tool label="Smaller text" disabled={disabled || sizeIndex === 0} onClick={() => chooseSize(sizeIndex - 1)}>
            A&minus;
          </Tool>
          <span className="px-1 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]" aria-live="polite">
            {size.label}
          </span>
          <Tool label="Larger text" disabled={disabled || sizeIndex === SIZES.length - 1} onClick={() => chooseSize(sizeIndex + 1)}>
            A+
          </Tool>
        </div>
      </div>
      <EditorContent
        editor={editor}
        style={{ fontSize: `${size.px}px` }}
        className={[
          'font-serif leading-relaxed text-[var(--color-text-primary)]',
          '[&_.ProseMirror]:min-h-[14rem] [&_.ProseMirror]:px-4 [&_.ProseMirror]:py-4 [&_.ProseMirror]:outline-none',
          '[&_.ProseMirror_p]:mb-[1em] [&_.ProseMirror_p:last-child]:mb-0',
          '[&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-[var(--color-upside)] [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic',
          '[&_.ProseMirror_hr]:my-6 [&_.ProseMirror_hr]:border-[var(--color-line)]',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-[var(--color-text-secondary)]/60 [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
        ].join(' ')}
      />
    </div>
  )
}
