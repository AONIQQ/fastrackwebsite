export function withCheckoutReference(base, reference, additional = {}) {
  const url = new URL(base)
  for (const [key, value] of Object.entries(additional)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value))
  }
  if (reference) url.searchParams.set('client_reference_id', reference)
  return url.toString()
}

export function isCheckoutTokenShape(token) {
  return /^v1\.x\.[0-9a-f-]{36}\.(?:results|n[1-4])\.\d{10}\.[A-Za-z0-9_-]{43}$/.test(String(token || ''))
}
