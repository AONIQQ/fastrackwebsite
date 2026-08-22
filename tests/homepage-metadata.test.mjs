import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('homepage metadata is exact, bounded, clean, and internally consistent', async () => {
  const source = await read('../app/(home)/layout.tsx')
  const title = 'College Cost & Dual Credit Tools | Fastrack'
  const description =
    "Explore Fastrack's free college savings calculator and sourced dual-credit planning for 11th- and 12th-grade students considering a target college."

  assert.ok(title.length <= 60)
  assert.ok(description.length <= 160)
  assert.ok(source.includes(`const title = '${title}'`))
  assert.ok(source.includes(`  ${JSON.stringify(description)}`))
  assert.equal((source.match(/canonical:/g) ?? []).length, 1)
  assert.match(source, /canonical: '\/'/)
  assert.match(source, /url: 'https:\/\/www\.fastrack\.school\/'/)
  assert.doesNotMatch(source, /utm_|gclid|fbclid|searchParams|guarantee|guaranteed|will save|actual(?:ly)? pay|\$\d/i)
  assert.equal((source.match(/\btitle,/g) ?? []).length, 3)
  assert.equal((source.match(/\bdescription,/g) ?? []).length, 3)
})

test('homepage metadata is route-scoped and does not alter shared defaults or sibling metadata', async () => {
  const [root, calculator, creditMap, state, college] = await Promise.all([
    read('../app/layout.tsx'),
    read('../app/calculator/layout.tsx'),
    read('../app/credit-map/layout.tsx'),
    read('../app/savings/[state]/page.tsx'),
    read('../app/college/[slug]/page.tsx'),
  ])

  assert.match(root, /title: 'Fastrack'/)
  assert.match(calculator, /title: 'Free College Savings Calculator \| Fastrack'/)
  assert.match(creditMap, /const title = 'Sourced Dual Credit Plan \| Fastrack Credit Map'/)
  assert.match(state, /statePageMetadata/)
  assert.match(college, /collegeDefaultMetadata/)
  assert.doesNotMatch(`${root}\n${calculator}\n${creditMap}\n${state}\n${college}`, /College Cost & Dual Credit Tools/)
})

test('homepage visible claims and calculator route support the metadata description', async () => {
  const [home, calculator] = await Promise.all([
    read('../app/(home)/page.tsx'),
    read('../app/calculator/page.tsx'),
  ])

  assert.match(home, /Dual-credit plan/i)
  assert.match(home, /target degree/i)
  assert.match(home, /href="\/calculator"/)
  assert.match(calculator, /Free Tool &middot; College Cost Calculator/)
  assert.match(calculator, /Modeled dual-credit scenario/)
})
