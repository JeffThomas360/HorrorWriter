/**
 * SEO & Schema.org utilities for Horror Writer.
 * Designed for maximum Google discoverability, rich snippet eligibility,
 * and high-ranking search appearance.
 */

export function buildWebSiteSchema({ url = 'https://horrorwriter.org', name = 'Horror Writer', description }) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${url}/#website`,
        url,
        name,
        description: description || 'A premier community for serious horror writers — forums, critique, and dark fiction craft.',
        publisher: {
          '@id': `${url}/#organization`
        },
        inLanguage: 'en-US',
        potentialAction: {
          '@type': 'SearchAction',
          target: `${url}/forum?q={search_term_string}`,
          'query-input': 'required name=search_term_string'
        }
      },
      {
        '@type': 'Organization',
        '@id': `${url}/#organization`,
        name: 'Horror Writer',
        url,
        logo: {
          '@type': 'ImageObject',
          url: `${url}/og.png`,
          width: 1200,
          height: 630
        },
        sameAs: [
          'https://horrorwriter.org'
        ]
      }
    ]
  }
}

export function buildFAQSchema(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer
      }
    }))
  }
}

export function buildBreadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  }
}

export function buildCreativeWorkSchema({ url, title, description, authorName, datePublished, genre = 'Horror', type = 'CreativeWork' }) {
  return {
    '@context': 'https://schema.org',
    '@type': type,
    url,
    headline: title,
    name: title,
    description,
    genre,
    inLanguage: 'en-US',
    datePublished,
    author: {
      '@type': 'Person',
      name: authorName
    },
    publisher: {
      '@type': 'Organization',
      name: 'Horror Writer',
      url: 'https://horrorwriter.org'
    }
  }
}

export function buildDiscussionForumPostingSchema({ url, headline, authorName, datePublished, interactionCount = 0 }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    url,
    headline,
    datePublished,
    inLanguage: 'en-US',
    author: {
      '@type': 'Person',
      name: authorName
    },
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/CommentAction',
      userInteractionCount: interactionCount
    }
  }
}

export function buildProfilePageSchema({ url, name }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url,
    mainEntity: {
      '@type': 'Person',
      name
    }
  }
}

export function buildCreativeWorkSeriesSchema({ url, name, description }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWorkSeries',
    url,
    name,
    description
  }
}

export function buildSitemapXml(urls) {
  const body = urls.map(({ loc, lastmod }) =>
    `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`
}

export function buildSitemapIndexXml(sitemaps) {
  const body = sitemaps.map(({ loc, lastmod }) =>
    `<sitemap><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</sitemap>`
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`
}

