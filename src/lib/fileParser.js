/**
 * Parses a File object (.txt, .docx, .md) and returns a Markdown string.
 * @param {File} file 
 * @returns {Promise<string>}
 */
export async function parseFileToMarkdown(file) {
  if (!file) throw new Error('No file provided')

  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
    return await file.text()
  }

  if (ext === 'docx') {
    try {
      // Dynamic imports to prevent these massive libraries from bloating the main bundle
      const mammoth = (await import('mammoth')).default
      const TurndownService = (await import('turndown')).default
      
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        hr: '---',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
      })

      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.convertToHtml({ arrayBuffer })
      const html = result.value
      // Convert HTML to Markdown
      const markdown = turndownService.turndown(html)
      return markdown
    } catch (err) {
      console.error('Error parsing docx:', err)
      throw new Error('Could not parse docx file. Ensure it is a valid Word document.')
    }
  }

  throw new Error(`Unsupported file type: .${ext}. Please upload a .txt, .md, or .docx file.`)
}
