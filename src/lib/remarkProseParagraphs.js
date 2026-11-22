// Stories pasted from a word processor often carry ONE line break between
// paragraphs. Markdown reads that as a single paragraph, and remark-breaks then
// renders it as one block full of <br>: a whole story with no paragraph gaps.
//
// This plugin splits such a paragraph at its line breaks, but only when it
// holds at least one prose-length line. A block of short lines (verse, an
// address, a sign on a door) is left alone so it keeps its tight line breaks.

// Longer than a line of verse, shorter than nearly any paragraph of prose.
export const PROSE_LINE_LENGTH = 120

const INVISIBLE = /[\s​‌‍﻿]/g

function textOf(node) {
  if (typeof node.value === 'string') return node.value
  return (node.children || []).map(textOf).join('')
}

// The paragraph's inline children, grouped by the line they sit on.
function linesOf(paragraph) {
  const lines = [[]]
  for (const child of paragraph.children) {
    if (child.type === 'break') {
      lines.push([])
    } else if (child.type === 'text' && child.value.includes('\n')) {
      child.value.split('\n').forEach((part, i) => {
        if (i > 0) lines.push([])
        if (part) lines[lines.length - 1].push({ type: 'text', value: part })
      })
    } else {
      lines[lines.length - 1].push(child)
    }
  }
  return lines
}

function splitParagraph(paragraph) {
  const lines = linesOf(paragraph)
  if (lines.length < 2) return [paragraph]
  const texts = lines.map((line) => line.map(textOf).join(''))
  if (!texts.some((t) => t.length >= PROSE_LINE_LENGTH)) return [paragraph]
  return lines
    .filter((_, i) => texts[i].replace(INVISIBLE, '') !== '')
    .map((children) => ({ type: 'paragraph', children }))
}

function walk(node) {
  if (!Array.isArray(node.children)) return
  node.children = node.children.flatMap((child) => {
    if (child.type === 'paragraph') return splitParagraph(child)
    walk(child)
    return [child]
  })
}

export default function remarkProseParagraphs() {
  return (tree) => walk(tree)
}
