import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'

import { retiredRouteDestination } from '../lib/retired-route-url.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('retired routes preserve only safe attribution and calculator prefill values', () => {
  const calculator = new URL(`https://www.fastrack.school${retiredRouteDestination('/calculator', {
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'validation',
    gclid: 'click-1',
    fbclid: 'social-1',
    state: 'pa',
    residency: 'inState',
    collegeId: '214777',
    email: 'private@example.com',
    next: 'https://example.com',
  }, true)}`)

  assert.equal(calculator.pathname, '/calculator')
  assert.deepEqual(Object.fromEntries(calculator.searchParams), {
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'validation',
    gclid: 'click-1',
    fbclid: 'social-1',
    state: 'PA',
    residency: 'inState',
    collegeId: '214777',
  })

  const creditMap = new URL(`https://www.fastrack.school${retiredRouteDestination('/credit-map', {
    utm_source: 'email',
    state: 'AZ',
    residency: 'outOfState',
    collegeId: '42',
  })}`)
  assert.equal(creditMap.pathname, '/credit-map')
  assert.deepEqual(Object.fromEntries(creditMap.searchParams), { utm_source: 'email' })
})

test('retired route query handling rejects arrays, malformed prefills, and oversized values', () => {
  const destination = retiredRouteDestination('/calculator', {
    utm_source: ['google'],
    utm_campaign: 'x'.repeat(513),
    state: 'Pennsylvania',
    residency: 'local',
    collegeId: '12x',
  }, true)
  assert.equal(destination, '/calculator')
})

test('legacy pages are permanent redirects to the approved destinations', async () => {
  const [counselors, pricing, signup] = await Promise.all([
    read('../app/counselors/page.tsx'),
    read('../app/pricing/page.tsx'),
    read('../app/signup/page.tsx'),
  ])

  assert.match(counselors, /permanentRedirect\(retiredRouteDestination\('\/calculator', searchParams, true\)\)/)
  assert.match(pricing, /permanentRedirect\(retiredRouteDestination\('\/credit-map', searchParams\)\)/)
  assert.match(signup, /permanentRedirect\(retiredRouteDestination\('\/calculator', searchParams, true\)\)/)
  assert.doesNotMatch(`${counselors}\n${pricing}\n${signup}`, /\$500|training program|invoice|SignUpForm/)
})

test('retired routes are absent from sitemap and internal links', async () => {
  const appRoot = new URL('../app/', import.meta.url)
  const entries = await readdir(appRoot, { recursive: true, withFileTypes: true })
  const sourceFiles = entries.filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
  const publicSurfaces = (await Promise.all(sourceFiles.map((entry) => readFile(`${entry.parentPath}/${entry.name}`, 'utf8')))).join('\n')
  const sitemap = await read('../app/sitemap.ts')

  assert.doesNotMatch(sitemap, /['"]\/(?:counselors|pricing|signup)(?:['"?#])/)
  assert.doesNotMatch(publicSurfaces, /href\s*=\s*(?:\{)?['"]\/(?:counselors|pricing|signup)(?:['"?#])/)
})
