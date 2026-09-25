import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

// Story bodies are author-supplied and read by everyone, so raw HTML is parsed
// (for the editor's <u> and <mark>) and then sanitized against GitHub's schema.
// Sanitize must run AFTER rehype-raw, or the raw nodes it creates skip it.
const storySchema = {
  ...defaultSchema,
  tagNames: [...defaultSchema.tagNames, 'u', 'mark'],
}

export const storyRehypePlugins = [rehypeRaw, [rehypeSanitize, storySchema]]

export default function StoryMarkdown({ content }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={storyRehypePlugins}>
      {content || ''}
    </ReactMarkdown>
  )
}
