import type { MetadataRoute } from 'next'
import { STATE_NAMES, stateSlug } from '@/lib/states'

const SITE = 'https://www.fastrack.school'

export default function sitemap(): MetadataRoute.Sitemap {
  const statics = ['', '/calculator', '/credit-map', '/savings', '/guide', '/counselors', '/pricing'].map((p) => ({
    url: `${SITE}${p}`,
    changeFrequency: 'weekly' as const,
    priority: p === '' ? 1 : 0.8,
  }))
  const states = Object.keys(STATE_NAMES).map((code) => ({
    url: `${SITE}/savings/${stateSlug(code)}`,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))
  return [...statics, ...states]
}
