import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { withAttributionQuery } from '../lib/attribution-url.mjs'
import {
  collegeSeoExperiment,
  collegeSeoMetadata,
  collegeSeoOpening,
} from '../lib/college-seo-experiment.mjs'

const selected = [
  [209551, 'University of Oregon', '/college/209551-university-of-oregon'],
  [218672, 'USC Lancaster', '/college/218672-university-of-south-carolina-lancaster'],
  [100663, 'UAB', '/college/100663-university-of-alabama-at-birmingham'],
  [164748, 'Berklee College of Music', '/college/164748-berklee-college-of-music'],
  [139940, 'Georgia State University', '/college/139940-georgia-state-university'],
]

const college = (id) => ({
  id,
  name: id === 209551
    ? 'University of Oregon'
    : id === 218672
      ? 'University of South Carolina-Lancaster'
      : id === 164748
        ? 'Berklee College of Music'
        : id === 139940
          ? 'Georgia State University'
        : 'University of Alabama at Birmingham',
  tuition_in: 12_345,
  tuition_out: 45_678,
  net_price: 23_456,
})

test('the experiment is an exact five-ID allowlist with clean self-canonicals', () => {
  for (const [id, searchName, canonicalPath] of selected) {
    const experiment = collegeSeoExperiment(id)
    assert.equal(experiment.searchName, searchName)
    assert.equal(experiment.canonicalPath, canonicalPath)
    if (id !== 139940) assert.equal(experiment.residencyNote, undefined)
    const metadata = collegeSeoMetadata(college(id))
    assert.equal(metadata.canonicalPath, canonicalPath)
    assert.match(metadata.title, new RegExp(`^${searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} Cost and Tuition`))
    assert.ok(metadata.title.length <= 60, `title is ${metadata.title.length} characters`)
    assert.ok(metadata.description.length <= 160, `description is ${metadata.description.length} characters`)
    assert.equal(new URL(metadata.canonicalPath, 'https://www.fastrack.school').search, '')
  }

  for (const id of [1, 100654, 139939, 139941, 164747, 164749, 209550, 209552, 218671, 218673]) {
    assert.equal(collegeSeoExperiment(id), null)
    assert.equal(collegeSeoMetadata(college(id)), null)
    assert.equal(collegeSeoOpening(college(id)), null)
  }
})

test('adding Georgia State changes no nonselected presentation', () => {
  const nonselected = [
    college(100654),
    college(139939),
    college(139941),
    college(164747),
    college(164749),
    college(233921),
  ]
  const before = nonselected.map((entry) => ({
    metadata: null,
    opening: null,
  }))
  const after = nonselected.map((entry) => ({
    metadata: collegeSeoMetadata(entry),
    opening: collegeSeoOpening(entry),
  }))
  assert.deepEqual(after, before)
})

test('copy uses only supplied authoritative cost fields and keeps claim boundaries explicit', () => {
  for (const [id] of selected) {
    const metadata = collegeSeoMetadata(college(id))
    const opening = collegeSeoOpening(college(id))
    assert.match(metadata.description, /\$12,345 published in-state tuition/)
    assert.match(metadata.description, /Compare it with average net price/)
    assert.match(opening.answer, /published tuition of \$12,345 for in-state students and \$45,678 for out-of-state students/)
    assert.match(opening.answer, /average net price of \$23,456 per year for federal-aid recipients after grant and scholarship aid/)
    assert.match(opening.answer, /different measures/)
    assert.match(opening.answer, /neither is your family’s personalized aid offer/)
    assert.match(opening.answer, /different reporting periods and can change/)
    assert.doesNotMatch(`${metadata.title} ${metadata.description} ${opening.answer}`, /acceptance|guarantee|guaranteed|will save|actual(?:ly)? pay/i)
  }
})

test('Berklee presentation answers current supplied cost fields without conflating them', () => {
  const berklee = {
    id: 164748,
    name: 'Berklee College of Music',
    tuition_in: 52_040,
    tuition_out: 52_040,
    net_price: 49_465,
  }
  const metadata = collegeSeoMetadata(berklee)
  const opening = collegeSeoOpening(berklee)
  assert.equal(metadata.title, 'Berklee College of Music Cost and Tuition | Fastrack')
  assert.ok(metadata.title.length <= 60)
  assert.ok(metadata.description.length <= 160)
  assert.equal(metadata.canonicalPath, '/college/164748-berklee-college-of-music')
  assert.equal(opening.heading, 'How much does Berklee College of Music cost?')
  assert.match(opening.answer, /published tuition of \$52,040 for in-state students and \$52,040 for out-of-state students/)
  assert.match(opening.answer, /average net price of \$49,465 per year for federal-aid recipients after grant and scholarship aid/)
  assert.match(opening.answer, /neither is your family’s personalized aid offer/)
})

test('Georgia State presentation distinguishes current tuition, net price, residency, and aid', () => {
  const georgiaState = {
    id: 139940,
    name: 'Georgia State University',
    tuition_in: 8_664,
    tuition_out: 24_840,
    net_price: 15_931,
  }
  const metadata = collegeSeoMetadata(georgiaState)
  const opening = collegeSeoOpening(georgiaState)
  assert.equal(metadata.title, 'Georgia State University Cost and Tuition | Fastrack')
  assert.ok(metadata.title.length <= 60)
  assert.ok(metadata.description.length <= 160)
  assert.equal(metadata.canonicalPath, '/college/139940-georgia-state-university')
  assert.equal(opening.heading, 'How much does Georgia State University cost?')
  assert.match(opening.answer, /published tuition of \$8,664 for in-state students and \$24,840 for out-of-state students/)
  assert.match(opening.answer, /average net price of \$15,931 per year for federal-aid recipients after grant and scholarship aid/)
  assert.match(opening.answer, /different measures/)
  assert.match(opening.answer, /neither is your family’s personalized aid offer/)
  assert.match(opening.answer, /Residency classification determines which published tuition applies/)
  assert.match(opening.answer, /choosing in-state in the calculator does not establish eligibility/)
})

test('missing fields are described as unavailable rather than invented', () => {
  const missing = collegeSeoOpening({ ...college(209551), tuition_in: null, tuition_out: null, net_price: null })
  assert.match(missing.answer, /Published tuition is not available/)
  assert.match(missing.answer, /Average net price is not available/)
  assert.doesNotMatch(missing.answer, /\$/)
})

test('calculator CTA destination preserves prefill and only approved attribution', () => {
  const output = new URL(`https://www.fastrack.school${withAttributionQuery(
    '/calculator?state=OR&residency=inState&collegeId=209551',
    { utm_source: 'google', utm_medium: 'organic', utm_campaign: 'agent-20260811', gclid: 'g-1', fbclid: 'f-1', email: 'private@example.com' },
  )}`)
  assert.deepEqual(Object.fromEntries(output.searchParams), {
    state: 'OR', residency: 'inState', collegeId: '209551',
    utm_source: 'google', utm_medium: 'organic', utm_campaign: 'agent-20260811', gclid: 'g-1', fbclid: 'f-1',
  })
  const berklee = new URL(`https://www.fastrack.school${withAttributionQuery(
    '/calculator?state=MA&residency=inState&collegeId=164748',
    { utm_source: 'google', utm_medium: 'organic', utm_campaign: 'agent-20260811', gclid: 'g-2', ignored: 'private' },
  )}`)
  assert.deepEqual(Object.fromEntries(berklee.searchParams), {
    state: 'MA', residency: 'inState', collegeId: '164748',
    utm_source: 'google', utm_medium: 'organic', utm_campaign: 'agent-20260811', gclid: 'g-2',
  })
  const georgiaState = new URL(`https://www.fastrack.school${withAttributionQuery(
    '/calculator?state=GA&residency=inState&collegeId=139940',
    { utm_source: 'google', utm_medium: 'organic', utm_campaign: 'agent-20260811', gclid: 'g-3', fbclid: 'f-3', email: 'private@example.com' },
  )}`)
  assert.deepEqual(Object.fromEntries(georgiaState.searchParams), {
    state: 'GA', residency: 'inState', collegeId: '139940',
    utm_source: 'google', utm_medium: 'organic', utm_campaign: 'agent-20260811', gclid: 'g-3', fbclid: 'f-3',
  })
})

test('route wires only the allowlisted metadata, opening, canonical, and CTA framing', async () => {
  const source = await readFile(new URL('../app/college/[slug]/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /collegeSeoMetadata\(c\)/)
  assert.match(source, /alternates: \{ canonical: experiment\.canonicalPath \}/)
  assert.match(source, /collegeSeoOpening\(c\)/)
  assert.match(source, /state=\$\{c\.state\}&residency=inState&collegeId=\$\{c\.id\}/)
  assert.match(source, /withAttributionQuery\(calcHref, searchParams\)/)
  assert.match(source, /Residency, course sequencing, catalog timing,/)
  assert.match(source, /published sources and flags what still needs confirmation/)
  assert.match(source, /does not bind \{c\.name\}/)
})
