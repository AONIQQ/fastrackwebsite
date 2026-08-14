export const FIRST_PARTY_FUNNEL_EVENTS = Object.freeze([
  'Calculator Intent',
  'Calculator Modal Opened',
  'Capture Submission Attempted',
  'Lead Captured',
  'Capture Failed',
])

export const FIRST_PARTY_FUNNEL_SOURCES = Object.freeze([
  'direct', 'reddit', 'facebook', 'forum', 'email', 'youtube', 'google', 'bing',
])

export const FIRST_PARTY_FUNNEL_MEDIA = Object.freeze([
  'direct', 'organic', 'partner', 'nurture', 'email', 'cpc', 'referral',
])
export const FIRST_PARTY_FUNNEL_CONTENT = Object.freeze([
  'partner-email', 'partner-form', 'community-reply', 'seo-page', 'homepage',
  'calculator', 'qa-t230',
])

const eventSet = new Set(FIRST_PARTY_FUNNEL_EVENTS)
const sourceSet = new Set(FIRST_PARTY_FUNNEL_SOURCES)
const mediumSet = new Set(FIRST_PARTY_FUNNEL_MEDIA)
const contentSet = new Set(FIRST_PARTY_FUNNEL_CONTENT)
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const CAMPAIGN = /^(?:agent-\d{8}|qa-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?|validation|direct)$/

function singleString(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : null
}

export function normalizeFirstPartyAttribution(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const keys = Object.keys(input)
  if (keys.some((key) => !['source', 'medium', 'campaign', 'content'].includes(key))) return null
  if (['source', 'medium', 'campaign'].some((key) => input[key] != null && typeof input[key] !== 'string')) return null

  const source = singleString(input.source) || 'direct'
  const medium = singleString(input.medium) || 'direct'
  const campaign = singleString(input.campaign) || 'direct'
  if (input.content != null && typeof input.content !== 'string') return null
  const normalizedContent = input.content == null || input.content === '' ? null : singleString(input.content)
  const content = normalizedContent !== null && contentSet.has(normalizedContent) ? normalizedContent : null
  if (!sourceSet.has(source) || !mediumSet.has(medium) || !CAMPAIGN.test(campaign)) return null
  if ((source === 'direct') !== (medium === 'direct') || (source === 'direct') !== (campaign === 'direct')) return null
  return { source, medium, campaign, content }
}

export function classifyFirstPartyTraffic(attribution) {
  return attribution.campaign.startsWith('qa-') || attribution.campaign === 'validation' ? 'qa' : 'business'
}

export function parseFirstPartyFunnelEventBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const keys = Object.keys(value)
  if (keys.length !== 3 || keys.some((key) => !['event', 'session', 'attribution'].includes(key))) return null
  if (!eventSet.has(value.event) || typeof value.session !== 'string' || !UUID_V4.test(value.session.toLowerCase())) return null
  const attribution = normalizeFirstPartyAttribution(value.attribution)
  if (!attribution) return null
  return { event: value.event, session: value.session.toLowerCase(), attribution, trafficClass: classifyFirstPartyTraffic(attribution) }
}

export function parseFirstPartyFunnelSessionBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const keys = Object.keys(value)
  if (keys.length !== 2 || keys.some((key) => !['session', 'qa'].includes(key))) return null
  if (typeof value.session !== 'string' || !UUID_V4.test(value.session.toLowerCase()) || typeof value.qa !== 'boolean') return null
  return { session: value.session.toLowerCase(), qa: value.qa }
}

export function firstPartyRequestContextIsAllowed(headers) {
  return ['https://fastrack.school', 'https://www.fastrack.school'].includes(headers.get('origin') ?? '')
    && headers.get('sec-fetch-site') === 'same-origin'
    && headers.get('sec-fetch-mode') === 'cors'
    && headers.get('sec-fetch-dest') === 'empty'
}

export function firstPartyAttributionFromSearch(search = '') {
  const params = new URLSearchParams(search)
  if (['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].some((key) => params.getAll(key).length > 1)) return null
  return normalizeFirstPartyAttribution({
    source: params.get('utm_source') || 'direct',
    medium: params.get('utm_medium') || 'direct',
    campaign: params.get('utm_campaign') || 'direct',
    content: params.get('utm_content') || null,
  })
}
