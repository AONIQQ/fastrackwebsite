import { withAttributionQuery } from './attribution-url.mjs'

const MAX_ATTRIBUTION_LENGTH = 512

function scalarValue(value) {
  return typeof value === 'string' ? value : null
}

function boundedAttribution(sourceQuery) {
  const output = {}
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'gclid', 'fbclid']) {
    const value = scalarValue(sourceQuery?.[key])
    if (value && value.length <= MAX_ATTRIBUTION_LENGTH) output[key] = value
  }
  return output
}

export function retiredRouteDestination(destination, sourceQuery, includeCalculatorPrefill = false) {
  const attributed = withAttributionQuery(destination, boundedAttribution(sourceQuery))
  if (!includeCalculatorPrefill) return attributed

  const output = new URL(attributed, 'https://www.fastrack.school')
  const state = scalarValue(sourceQuery?.state)
  const residency = scalarValue(sourceQuery?.residency)
  const collegeId = scalarValue(sourceQuery?.collegeId)

  if (state && /^[a-z]{2}$/i.test(state)) output.searchParams.set('state', state.toUpperCase())
  if (residency === 'inState' || residency === 'outOfState') output.searchParams.set('residency', residency)
  if (collegeId && /^\d{1,10}$/.test(collegeId)) output.searchParams.set('collegeId', collegeId)

  return `${output.pathname}${output.search}`
}
