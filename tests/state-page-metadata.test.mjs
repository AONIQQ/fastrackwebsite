import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { statePageMetadata } from '../lib/state-page-metadata.mjs'

const route = await readFile(new URL('../app/savings/[state]/page.tsx', import.meta.url), 'utf8')
const statesSource = await readFile(new URL('../lib/states.ts', import.meta.url), 'utf8')
const states = [...statesSource.matchAll(/\b([A-Z]{2}): '([^']+)'/g)].map(([, code, name]) => ({ code, name }))
const slug = (name) => name.toLowerCase().replace(/[^a-z]+/g, '-')

test('all 50 states and Washington D.C. have unique bounded metadata and clean canonicals', () => {
  assert.equal(states.length, 51)
  const titles = new Set()
  const descriptions = new Set()
  const canonicals = new Set()

  for (const { name } of states) {
    const metadata = statePageMetadata(name, slug(name))
    assert.ok(metadata.title.length <= 60, `${name} title is ${metadata.title.length} characters`)
    assert.ok(metadata.description.length <= 160, `${name} description is ${metadata.description.length} characters`)
    assert.match(metadata.title, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(metadata.description, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.equal(metadata.alternates.canonical, `/savings/${slug(name)}`)
    assert.equal(new URL(metadata.alternates.canonical, 'https://www.fastrack.school').search, '')
    titles.add(metadata.title)
    descriptions.add(metadata.description)
    canonicals.add(metadata.alternates.canonical)
  }

  assert.equal(titles.size, 51)
  assert.equal(descriptions.size, 51)
  assert.equal(canonicals.size, 51)
})

test('state metadata preserves punctuation as text and never interpolates markup itself', () => {
  const dc = statePageMetadata('Washington D.C.', 'washington-d-c-')
  assert.match(dc.title, /Washington D\.C\./)
  assert.equal(dc.alternates.canonical, '/savings/washington-d-c-')

  const hostile = statePageMetadata(`A&B <script>alert('x')</script>`, 'safe-slug')
  assert.equal(hostile.title, `Modeled Dual Credit Costs in A&B <script>alert('x')</script> | Fastrack`)
  assert.equal(hostile.alternates.canonical, '/savings/safe-slug')
  assert.match(route, /return statePageMetadata\(name, stateSlug\(code\)\)/)
  assert.doesNotMatch(route, /dangerouslySetInnerHTML/)
})

test('query parameters cannot enter the canonical and unsupported routes emit no metadata', () => {
  assert.match(route, /if \(!code\) return \{\}/)
  assert.doesNotMatch(route.slice(0, route.indexOf('const fmt')), /searchParams/)

  const metadata = statePageMetadata('Pennsylvania', 'pennsylvania')
  const parameterized = new URL('/savings/pennsylvania?utm_source=reddit&state=PA&territory=PR', 'https://www.fastrack.school')
  assert.equal(new URL(metadata.alternates.canonical, parameterized).href, 'https://www.fastrack.school/savings/pennsylvania')
})
