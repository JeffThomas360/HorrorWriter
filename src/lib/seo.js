export function buildWebSiteSchema({ url, name, description }) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', url, name, description },
      { '@type': 'Organization', name, url }
    ]
  }
}

export function buildCreativeWorkSchema({ url, title, description, authorName, datePublished }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    url,
    headline: title,
    description,
    datePublished,
    author: { '@type': 'Person', name: authorName }
  }
}

export function buildDiscussionForumPostingSchema({ url, headline, authorName, datePublished }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    url,
    headline,
    datePublished,
    author: { '@type': 'Person', name: authorName }
  }
}

export function buildProfilePageSchema({ url, name }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url,
    mainEntity: { '@type': 'Person', name }
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
