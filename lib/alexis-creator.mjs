export const ALEXIS_CREATOR_CAMPAIGN = 'creator-20260820'

export const ALEXIS_CREATOR_PLATFORMS = Object.freeze([
  'instagram', 'tiktok', 'facebook', 'youtube',
])

export const ALEXIS_CREATOR_VIDEOS = Object.freeze([
  { id: 'v001', label: 'The transfer-credit trap' },
  { id: 'v002', label: 'Average net price is not your aid offer' },
  { id: 'v003', label: 'In-state versus out-of-state cost' },
  { id: 'v004', label: 'AP, dual enrollment, or CLEP' },
  { id: 'v005', label: 'When an accepted credit is only an elective' },
  { id: 'v006', label: 'Three checks before enrolling' },
  { id: 'v007', label: 'Model a college-specific cost path' },
])

const platformSet = new Set(ALEXIS_CREATOR_PLATFORMS)
const videoSet = new Set(ALEXIS_CREATOR_VIDEOS.map(({ id }) => id))

export function alexisCreatorPlatform(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return platformSet.has(normalized) ? normalized : null
}

export function alexisCreatorVideo(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return videoSet.has(normalized) ? normalized : null
}

export function alexisCreatorContent(video) {
  const normalized = alexisCreatorVideo(video)
  return normalized ? `alexis-${normalized}` : null
}

export function alexisCalculatorUrl({ platform, video }) {
  const source = alexisCreatorPlatform(platform)
  const content = alexisCreatorContent(video)
  if (!source || !content) return null
  const url = new URL('https://www.fastrack.school/calculator')
  url.searchParams.set('utm_source', source)
  url.searchParams.set('utm_medium', 'organic')
  url.searchParams.set('utm_campaign', ALEXIS_CREATOR_CAMPAIGN)
  url.searchParams.set('utm_content', content)
  return url.toString()
}

export function alexisCreatorVideoLabel(content) {
  const video = typeof content === 'string' && /^alexis-v[0-9]{3}$/.test(content)
    ? content.slice('alexis-'.length)
    : null
  if (!video) return null
  return ALEXIS_CREATOR_VIDEOS.find((candidate) => candidate.id === video)?.label ?? `Video ${video.toUpperCase()}`
}
