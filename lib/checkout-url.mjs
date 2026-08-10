export function withCheckoutReference(base, reference, additional = {}) {
  const url = new URL(base)
  for (const [key, value] of Object.entries(additional)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value))
  }
  if (reference) url.searchParams.set('client_reference_id', reference)
  return url.toString()
}
