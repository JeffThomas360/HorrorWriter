import { useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { parseFileToMarkdown } from '../lib/fileParser'

export default function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Speak into the void...',
  rows = 10,
  disabled = false,
}) {
  const [isPreview, setIsPreview] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)

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
      // Append or replace? If editor is empty, replace. Else, append.
      const newText = value ? value + '\n\n' + markdown : markdown
      onChange({ target: { value: newText } })
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="md-editor">
      <div className="md-toolbar">
        <div className="md-tools">
          <button type="button" onClick={() => insertText('**', '**')} title="Bold" disabled={disabled || isPreview}>B</button>
          <button type="button" onClick={() => insertText('*', '*')} title="Italic" disabled={disabled || isPreview}>I</button>
          <button type="button" onClick={() => insertText('`', '`')} title="Code" disabled={disabled || isPreview}>{'</>'}</button>
          <button type="button" onClick={() => insertText('> ')} title="Quote" disabled={disabled || isPreview}>&quot;</button>
          <button type="button" onClick={() => insertText('[', '](https://)')} title="Link" disabled={disabled || isPreview}>🔗</button>
          
          <div className="md-divider" />
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".txt,.md,.markdown,.docx" 
            style={{ display: 'none' }} 
          />
          <button 
            type="button" 
            className="md-upload-btn"
            onClick={() => fileInputRef.current?.click()} 
            disabled={disabled || isPreview || isUploading}
            title="Import .txt or .docx"
          >
            {isUploading ? 'Parsing…' : '📁 Import File'}
          </button>
        </div>

        <div className="md-modes">
          <button 
            type="button" 
            className={!isPreview ? 'active' : ''} 
            onClick={() => setIsPreview(false)}
          >
            Write
          </button>
          <button 
            type="button" 
            className={isPreview ? 'active' : ''} 
            onClick={() => setIsPreview(true)}
          >
            Preview
          </button>
        </div>
      </div>
      
      {uploadError && (
        <div className="md-error" style={{ padding: '8px 12px', background: 'rgba(255,42,109,0.1)', color: 'var(--blood)', fontSize: 13 }}>
          {uploadError}
        </div>
      )}

      {isPreview ? (
        <div className="md-preview prose">
          {value ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {value}
            </ReactMarkdown>
          ) : (
            <span className="muted" style={{ fontStyle: 'italic' }}>Nothing to preview...</span>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className="md-textarea"
        />
      )}
    </div>
  )
}
