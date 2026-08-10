const ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'gclid', 'fbclid']

export function withAttributionQuery(destination, sourceQuery) {
  const [path, existingQuery = ''] = destination.split('?', 2)
  const output = new URLSearchParams(existingQuery)
  const source = typeof sourceQuery === 'string'
    ? new URLSearchParams(sourceQuery.startsWith('?') ? sourceQuery.slice(1) : sourceQuery)
    : sourceQuery

  for (const key of ATTRIBUTION_KEYS) {
    const raw = typeof source?.get === 'function' ? source.get(key) : source?.[key]
    const value = typeof raw === 'string' ? raw : null
    if (value && !output.has(key)) output.set(key, value)
  }

  const query = output.toString()
  return query ? `${path}?${query}` : path
}
