import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

// Craft pages: human-written guides on critique and horror craft (standing decision:
// no machine-written pages). One markdown file per page in src/content/craft/.
// Files starting with "_" (the template) are never loaded.
const craft = defineCollection({
  loader: glob({ pattern: '[^_]*.md', base: './src/content/craft' }),
  schema: z.object({
    /** Page title. Shown as the H1 and, with " | Horror Writer", as the <title>. */
    title: z.string().min(10).max(70),
    /** Search-result snippet. Written for a person deciding whether to click. */
    description: z.string().min(50).max(155),
    /** The search this page answers, from the topic map. Never shown on the page. */
    search: z.string(),
    /** Byline: a member handle with a public profile at /u/<handle>/. */
    author: z.string().default('beetlebub'),
    /** Required once draft is false. */
    published: z.coerce.date().optional(),
    updated: z.coerce.date().optional(),
    /** Drafts render only under `npm run dev`, marked and noindexed. */
    draft: z.boolean().default(true),
    /** Lower first on /craft/. */
    order: z.number().default(100),
  }).refine((d) => d.draft || d.published, { message: 'set `published` before setting draft: false' }),
})

export const collections = { craft }
