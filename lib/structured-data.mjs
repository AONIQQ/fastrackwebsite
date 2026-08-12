const SITE_ORIGIN = 'https://www.fastrack.school'

function absoluteUrl(path) {
  return new URL(path, SITE_ORIGIN).toString()
}

function breadcrumbList(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.path ? { item: absoluteUrl(item.path) } : {}),
    })),
  }
}

export function stateBreadcrumbData(stateName) {
  return breadcrumbList([
    { name: 'Dual credit savings by state', path: '/savings' },
    { name: stateName },
  ])
}

export function collegeBreadcrumbData({ collegeName, stateName, statePath }) {
  if (statePath) {
    return breadcrumbList([
      { name: 'Dual credit savings by state', path: '/savings' },
      { name: stateName, path: statePath },
      { name: collegeName },
    ])
  }

  return breadcrumbList([
    { name: 'Fastrack', path: '/' },
    { name: collegeName },
  ])
}

export function serializeJsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
