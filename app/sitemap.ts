import type { MetadataRoute } from 'next'
import { getAllComputableColleges } from '@/lib/db'
import { STATE_NAMES, collegeSlug, stateSlug } from '@/lib/states'

const SITE = 'https://www.fastrack.school'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics = ['', '/calculator', '/credit-map', '/savings', '/guide'].map((p) => ({
    url: `${SITE}${p}`,
    changeFrequency: 'weekly' as const,
    priority: p === '' ? 1 : 0.8,
  }))
  const states = Object.keys(STATE_NAMES).map((code) => ({
    url: `${SITE}/savings/${stateSlug(code)}`,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))
  let colleges: MetadataRoute.Sitemap = []
  try {
    colleges = (await getAllComputableColleges()).map((c) => ({
      url: `${SITE}/college/${collegeSlug(c.id, c.name)}`,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    }))
  } catch {
    // Local builds have no database; the deployed sitemap always does.
  }
  return [...statics, ...states, ...colleges]
}
