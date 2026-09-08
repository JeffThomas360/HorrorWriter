/**
 * SEO & Schema.org utilities for Horror Writer.
 * Designed for maximum Google discoverability, rich snippet eligibility,
 * and high-ranking search appearance.
 */

export const SITE_DESCRIPTION = 'A community for serious horror writers: publish stories in The Library, get real critique in The Crypt, and answer weekly dark-fiction prompts.';

/**
 * Build a meta description from free text (a story lede, a bio, a series blurb).
 * Collapses whitespace and light markdown, cuts at a word boundary under `max`,
 * and only appends an ellipsis when something was actually removed.
 * Returns `fallback` when the text is empty.
 */
export function metaDescription(text, { max = 155, fallback = '' } = {}) {
  const clean = String(text ?? '')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return fallback;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const atWord = cut.lastIndexOf(' ');
  return (atWord > max * 0.6 ? cut.slice(0, atWord) : cut).replace(/[\s,;:—-]+$/, '') + '…';
}

export function buildWebSiteSchema({ url = 'https://horrorwriter.org', name = 'Horror Writer', description }) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${url}/#website`,
        url,
        name,
        description: description || SITE_DESCRIPTION,
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

