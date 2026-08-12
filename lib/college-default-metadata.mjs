const TITLE_LIMIT = 60
const DESCRIPTION_LIMIT = 160
const TITLE_SUFFIX = ' Cost & Tuition | Fastrack'

function cleanText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncateText(value, limit) {
  const text = cleanText(value)
  if (text.length <= limit) return text
  if (limit <= 1) return '…'.slice(0, limit)

  const candidate = text.slice(0, limit - 1).trimEnd()
  const lastSpace = candidate.lastIndexOf(' ')
  const shortened = lastSpace >= Math.floor(limit * 0.55)
    ? candidate.slice(0, lastSpace).trimEnd()
    : candidate
  return `${shortened}…`
}

function duplicateLocator(college) {
  if (!Number.isInteger(college.same_name_count) || college.same_name_count <= 1) return ''
  return String(college.id)
}

function costLabel(college) {
  const hasTuition = college.tuition_in != null || college.tuition_out != null
  const hasNetPrice = college.net_price != null
  if (hasTuition && hasNetPrice) return 'published tuition and average net price'
  if (hasTuition) return 'published tuition'
  if (hasNetPrice) return 'average net price for federal-aid recipients'
  return 'available College Scorecard cost data'
}

export function collegeDefaultMetadata(college) {
  const locator = duplicateLocator(college)
  let titleQualifier = locator ? ` (${locator})` : ''
  const normalizedSourceName = String(college.name ?? '').normalize('NFC').trim()
  const normalizationChangesName = cleanText(college.name) !== normalizedSourceName
    || String(college.name ?? '').normalize('NFC') !== String(college.name ?? '')
  if (!titleQualifier && normalizationChangesName) {
    titleQualifier = ` (${college.id})`
  }
  if (`${cleanText(college.name)}${titleQualifier}${TITLE_SUFFIX}`.length > TITLE_LIMIT) {
    titleQualifier = ` (${college.id})`
  }
  const titleNameLimit = TITLE_LIMIT - TITLE_SUFFIX.length - titleQualifier.length
  const title = `${truncateText(college.name, Math.max(1, titleNameLimit))}${titleQualifier}${TITLE_SUFFIX}`

  const location = [cleanText(college.city), cleanText(college.state)].filter(Boolean).join(', ')
  const identityQualifier = normalizationChangesName
    ? ` (${college.id})`
    : locator
      ? ` (${locator})`
    : location
      ? ` in ${location}`
      : ''
  const middle = `: ${costLabel(college)}`
  const ending = '. Compare a modeled dual-credit cost scenario with stated limitations.'
  const identityLimit = DESCRIPTION_LIMIT - middle.length - ending.length
  let identity = `${cleanText(college.name)}${identityQualifier}`
  if (identity.length > identityLimit) {
    const stableQualifier = ` (${college.id})`
    identity = `${truncateText(college.name, Math.max(1, identityLimit - stableQualifier.length))}${stableQualifier}`
  }
  const description = `${identity}${middle}${ending}`

  return { title, description }
}

export const COLLEGE_DEFAULT_METADATA_LIMITS = Object.freeze({
  title: TITLE_LIMIT,
  description: DESCRIPTION_LIMIT,
})
