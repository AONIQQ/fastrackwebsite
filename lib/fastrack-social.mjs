export const FASTTRACK_SOCIAL_CAMPAIGN = 'creator-20260830'

export const FASTTRACK_SOCIAL_PLATFORMS = Object.freeze([
  'instagram', 'tiktok', 'facebook',
])

const platformSet = new Set(FASTTRACK_SOCIAL_PLATFORMS)

export function fastrackSocialPlatform(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return platformSet.has(normalized) ? normalized : null
}

export function fastrackSocialCalculatorUrl({ platform }) {
  const source = fastrackSocialPlatform(platform)
  if (!source) return null
  const url = new URL('https://www.fastrack.school/calculator')
  url.searchParams.set('utm_source', source)
  url.searchParams.set('utm_medium', 'organic')
  url.searchParams.set('utm_campaign', FASTTRACK_SOCIAL_CAMPAIGN)
  url.searchParams.set('utm_content', 'calculator')
  return url.toString()
}

export function creatorAccountLabel({ campaign, content }) {
  if (campaign === FASTTRACK_SOCIAL_CAMPAIGN && content === 'calculator') {
    return 'Fastrack profile link'
  }
  return null
}
