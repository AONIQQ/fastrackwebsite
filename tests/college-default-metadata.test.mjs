import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  COLLEGE_DEFAULT_METADATA_LIMITS,
  collegeDefaultMetadata,
} from '../lib/college-default-metadata.mjs'
import { collegeSeoMetadata } from '../lib/college-seo-experiment.mjs'

const college = (overrides = {}) => ({
  id: 100654,
  name: 'Alabama A & M University',
  city: 'Normal',
  state: 'AL',
  tuition_in: 12345,
  tuition_out: 23456,
  net_price: 11111,
  same_name_count: 1,
  same_name_location_count: 1,
  ...overrides,
})

test('default metadata is concise, truthful, and preserves institution intent', () => {
  const metadata = collegeDefaultMetadata(college())
  assert.equal(metadata.title, 'Alabama A & M University Cost & Tuition | Fastrack')
  assert.match(metadata.description, /^Alabama A & M University in Normal, AL: published tuition and average net price\./)
  assert.match(metadata.description, /modeled dual-credit cost scenario with stated limitations\.$/)
  assert.ok(metadata.title.length <= COLLEGE_DEFAULT_METADATA_LIMITS.title)
  assert.ok(metadata.description.length <= COLLEGE_DEFAULT_METADATA_LIMITS.description)
  assert.doesNotMatch(`${metadata.title} ${metadata.description}`, /acceptance|guarantee|will save|actual(?:ly)? pay|\$\d/i)
})

test('long authoritative names truncate deterministically within both limits', () => {
  const record = college({
    id: 21130702,
    name: 'Bucks County Community College-Gene and Marlene Epstein Campus at Lower Bucks',
    city: 'Bristol',
    state: 'PA',
  })
  const first = collegeDefaultMetadata(record)
  const second = collegeDefaultMetadata(record)
  assert.deepEqual(first, second)
  assert.equal(first.title.length <= 60, true)
  assert.equal(first.description.length <= 160, true)
  assert.match(first.title, /… \(21130702\) Cost & Tuition \| Fastrack$/)
  assert.match(first.description, /\(21130702\):/)
  assert.match(first.description, /limitations\.$/)
})

test('duplicate names use stable authoritative IDs for globally unique snippets', () => {
  const california = college({ id: 112561, name: 'Columbia College', city: 'Sonora', state: 'CA', same_name_count: 4 })
  const missouri = college({ id: 177065, name: 'Columbia College', city: 'Columbia', state: 'MO', same_name_count: 4 })
  assert.notEqual(collegeDefaultMetadata(california).title, collegeDefaultMetadata(missouri).title)
  assert.match(collegeDefaultMetadata(california).title, /112561/)
  assert.match(collegeDefaultMetadata(missouri).description, /177065/)

  const first = college({ id: 387925, name: 'Cortiva Institute', city: 'Maitland', state: 'FL', same_name_count: 6, same_name_location_count: 2 })
  const second = college({ id: 438285, name: 'Cortiva Institute', city: 'Maitland', state: 'FL', same_name_count: 6, same_name_location_count: 2 })
  const firstMetadata = collegeDefaultMetadata(first)
  const secondMetadata = collegeDefaultMetadata(second)
  assert.notEqual(firstMetadata.title, secondMetadata.title)
  assert.notEqual(firstMetadata.description, secondMetadata.description)
  assert.match(firstMetadata.title, /387925/)
  assert.match(secondMetadata.title, /438285/)
})

test('duplicate-name locations cannot collide after normalization', () => {
  const first = college({ id: 900011, name: 'Example College', city: 'New  York', state: 'NY', same_name_count: 2 })
  const second = college({ id: 900012, name: 'Example College', city: 'New York', state: 'NY', same_name_count: 2 })
  assert.notEqual(collegeDefaultMetadata(first).title, collegeDefaultMetadata(second).title)
  assert.notEqual(collegeDefaultMetadata(first).description, collegeDefaultMetadata(second).description)
})

test('normalization cannot collapse distinct authoritative IDs in title or description', () => {
  const pairs = [
    [college({ id: 118143, name: "Lyle's College of  Beauty", city: 'Fresno', state: 'CA' }), college({ id: 118134, name: "Lyle's College of Beauty", city: 'Fresno', state: 'CA' })],
    [college({ id: 900001, name: 'Cafe\u0301 College', city: 'Same City', state: 'CA' }), college({ id: 900002, name: 'Café College', city: 'Same City', state: 'CA' })],
  ]
  for (const [dirty, clean] of pairs) {
    const dirtyMetadata = collegeDefaultMetadata(dirty)
    const cleanMetadata = collegeDefaultMetadata(clean)
    assert.notEqual(dirtyMetadata.title, cleanMetadata.title)
    assert.notEqual(dirtyMetadata.description, cleanMetadata.description)
    assert.match(dirtyMetadata.title, new RegExp(String(dirty.id)))
    assert.match(dirtyMetadata.description, new RegExp(String(dirty.id)))
  }
})

test('missing fields select only truthful cost labels', () => {
  assert.match(collegeDefaultMetadata(college({ tuition_in: null, tuition_out: null })).description, /average net price for federal-aid recipients/)
  assert.match(collegeDefaultMetadata(college({ net_price: null })).description, /published tuition/)
  assert.match(collegeDefaultMetadata(college({ tuition_in: null, tuition_out: null, net_price: null })).description, /available College Scorecard cost data/)
})

test('punctuation and hostile text remain bounded data while controls are normalized', () => {
  const metadata = collegeDefaultMetadata(college({
    id: 900001,
    name: `St. John's <\/title><script>alert(1)<\/script> College\nCampus`,
    city: 'O’Fallon\u0000',
    state: 'MO',
  }))
  assert.ok(metadata.title.length <= 60)
  assert.ok(metadata.description.length <= 160)
  assert.doesNotMatch(`${metadata.title} ${metadata.description}`, /[\u0000-\u001f\u007f]/)
  assert.match(metadata.description, /modeled dual-credit cost scenario/)
})

test('selected allowlist metadata remains byte-identical and the route adds no default canonical', async () => {
  const selected = college({ id: 209551, name: 'University of Oregon', city: 'Eugene', state: 'OR' })
  assert.deepEqual(collegeSeoMetadata(selected), {
    title: 'University of Oregon Cost and Tuition | Fastrack',
    description: 'University of Oregon cost: $12,345 published in-state tuition. Compare it with average net price and a qualified dual-credit cost scenario.',
    canonicalPath: '/college/209551-university-of-oregon',
  })

  const route = await readFile(new URL('../app/college/[slug]/page.tsx', import.meta.url), 'utf8')
  assert.match(route, /if \(experiment\)[\s\S]*alternates: \{ canonical: experiment\.canonicalPath \}/)
  assert.match(route, /return collegeDefaultMetadata\(c\)/)
  assert.doesNotMatch(route, /return \{\s*\.\.\.collegeDefaultMetadata\(c\)[\s\S]*canonical/)
})

test('territory and ordinary default rows share the bounded metadata branch without a canonical', () => {
  const ordinary = collegeDefaultMetadata(college())
  const territory = collegeDefaultMetadata(college({ id: 243744, name: 'University of Puerto Rico-Rio Piedras', city: 'San Juan', state: 'PR' }))
  assert.deepEqual(Object.keys(ordinary).sort(), ['description', 'title'])
  assert.deepEqual(Object.keys(territory).sort(), ['description', 'title'])
  assert.match(territory.title, /Cost & Tuition \| Fastrack$/)
  assert.ok(territory.description.length <= 160)
})
