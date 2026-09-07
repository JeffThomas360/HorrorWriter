import { describe, it, expect } from 'vitest'
import {
  buildWebSiteSchema,
  buildCreativeWorkSchema,
  buildDiscussionForumPostingSchema,
  buildProfilePageSchema,
  buildCreativeWorkSeriesSchema,
  buildSitemapXml,
  buildFAQSchema,
  buildBreadcrumbSchema,
  buildSitemapIndexXml
} from './seo'

describe('buildWebSiteSchema', () => {
  it('returns a WebSite + Organization graph', () => {
    const result = buildWebSiteSchema({
      url: 'https://horrorwriter.org',
      name: 'Horror Writer',
      description: 'A circle for serious horror writers.'
    })
    expect(result['@context']).toBe('https://schema.org')
    expect(result['@graph']).toHaveLength(2)
    expect(result['@graph'][0]).toMatchObject({ '@type': 'WebSite', url: 'https://horrorwriter.org', name: 'Horror Writer' })
    expect(result['@graph'][1]).toMatchObject({ '@type': 'Organization', name: 'Horror Writer' })
  })
})

describe('buildCreativeWorkSchema', () => {
  it('returns a CreativeWork schema with author and date', () => {
    const result = buildCreativeWorkSchema({
      url: 'https://horrorwriter.org/library/read/book-1',
      title: 'The Hollow House',
      description: 'A short story.',
      authorName: 'jeff-the-writer',
      datePublished: '2026-01-01T00:00:00Z'
    })
    expect(result).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      url: 'https://horrorwriter.org/library/read/book-1',
      headline: 'The Hollow House',
      description: 'A short story.',
      datePublished: '2026-01-01T00:00:00Z',
      author: { '@type': 'Person', name: 'jeff-the-writer' }
    })
  })
})

describe('buildDiscussionForumPostingSchema', () => {
  it('returns a DiscussionForumPosting schema', () => {
    const result = buildDiscussionForumPostingSchema({
      url: 'https://horrorwriter.org/forum/thread/thread-1',
      headline: 'How do you write quiet horror?',
      authorName: 'someone',
      datePublished: '2026-01-01T00:00:00Z'
    })
    expect(result).toMatchObject({
      '@type': 'DiscussionForumPosting',
      headline: 'How do you write quiet horror?',
      author: { '@type': 'Person', name: 'someone' }
    })
  })
})

describe('buildProfilePageSchema', () => {
  it('returns a ProfilePage + Person schema', () => {
    const result = buildProfilePageSchema({ url: 'https://horrorwriter.org/u/jeff', name: 'Jeff' })
    expect(result).toMatchObject({
      '@type': 'ProfilePage',
      mainEntity: { '@type': 'Person', name: 'Jeff' }
    })
  })
})

describe('buildCreativeWorkSeriesSchema', () => {
  it('returns a CreativeWorkSeries schema', () => {
    const result = buildCreativeWorkSeriesSchema({
      url: 'https://horrorwriter.org/library/series/series-1',
      name: 'The Hollow Chronicles',
      description: 'A three-part descent.'
    })
    expect(result).toMatchObject({
      '@type': 'CreativeWorkSeries',
      name: 'The Hollow Chronicles',
      description: 'A three-part descent.'
    })
  })
})

describe('buildSitemapXml', () => {
  it('builds a urlset with loc and lastmod', () => {
    const xml = buildSitemapXml([
      { loc: 'https://horrorwriter.org/library/read/book-1', lastmod: '2026-01-01T00:00:00Z' },
      { loc: 'https://horrorwriter.org/library/read/book-2' }
    ])
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain('<loc>https://horrorwriter.org/library/read/book-1</loc>')
    expect(xml).toContain('<lastmod>2026-01-01T00:00:00Z</lastmod>')
    expect(xml).toContain('<loc>https://horrorwriter.org/library/read/book-2</loc>')
    expect(xml).toContain('</urlset>')
  })

  it('returns an empty urlset for no URLs', () => {
    const xml = buildSitemapXml([])
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>')
  })
})

describe('buildFAQSchema', () => {
  it('builds an FAQPage schema with questions and answers', () => {
    const result = buildFAQSchema([
      { question: 'What is Horror Writer?', answer: 'A dark fiction community.' }
    ])
    expect(result['@context']).toBe('https://schema.org')
    expect(result['@type']).toBe('FAQPage')
    expect(result.mainEntity).toHaveLength(1)
    expect(result.mainEntity[0].name).toBe('What is Horror Writer?')
    expect(result.mainEntity[0].acceptedAnswer.text).toBe('A dark fiction community.')
  })
})

describe('buildBreadcrumbSchema', () => {
  it('builds a BreadcrumbList schema with positional list elements', () => {
    const result = buildBreadcrumbSchema([
      { name: 'Home', url: 'https://horrorwriter.org' },
      { name: 'Library', url: 'https://horrorwriter.org/library' }
    ])
    expect(result['@context']).toBe('https://schema.org')
    expect(result['@type']).toBe('BreadcrumbList')
    expect(result.itemListElement).toHaveLength(2)
    expect(result.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://horrorwriter.org'
    })
    expect(result.itemListElement[1]).toEqual({
      '@type': 'ListItem',
      position: 2,
      name: 'Library',
      item: 'https://horrorwriter.org/library'
    })
  })
})

describe('buildSitemapIndexXml', () => {
  it('builds a sitemapindex with loc and lastmod', () => {
    const xml = buildSitemapIndexXml([
      { loc: 'https://horrorwriter.org/sitemap-stories.xml', lastmod: '2026-09-07T00:00:00Z' }
    ])
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain('<loc>https://horrorwriter.org/sitemap-stories.xml</loc>')
    expect(xml).toContain('<lastmod>2026-09-07T00:00:00Z</lastmod>')
    expect(xml).toContain('</sitemapindex>')
  })
})
