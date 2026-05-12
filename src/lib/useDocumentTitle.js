import { useEffect } from 'react'

const BASE = 'HORROR WRITER'

/**
 * Sets document.title to "<page> · HORROR WRITER" for the duration of the
 * component being mounted. Restores the previous title on unmount.
 */
export function useDocumentTitle(page) {
  useEffect(() => {
    const prev = document.title
    document.title = page ? `${page} · ${BASE}` : BASE
    return () => { document.title = prev }
  }, [page])
}
