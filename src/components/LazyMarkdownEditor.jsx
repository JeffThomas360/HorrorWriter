import { lazy, Suspense } from 'react'

const MarkdownEditor = lazy(() => import('./MarkdownEditor'))

// Readers who never open a critique or reply box don't download the editor.
// Until it arrives, a plain textarea with the same value and handler works,
// so the box is usable at once and nothing typed is lost.
export default function LazyMarkdownEditor(props) {
  const { value, onChange, placeholder, rows = 5, disabled } = props
  return (
    <Suspense
      fallback={
        <textarea
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          aria-label={placeholder}
          className="block w-full resize-y border border-[var(--color-line)] bg-transparent px-4 py-4 text-[var(--color-text-primary)] font-serif text-base leading-relaxed focus:outline-none"
        />
      }
    >
      <MarkdownEditor {...props} />
    </Suspense>
  )
}
