import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  collegeBreadcrumbData,
  serializeJsonLd,
  stateBreadcrumbData,
} from '../lib/structured-data.mjs'

function assertGoogleBreadcrumbShape(data, expectedNames) {
  assert.equal(data['@context'], 'https://schema.org')
  assert.equal(data['@type'], 'BreadcrumbList')
  assert.equal(data.itemListElement.length, expectedNames.length)
  data.itemListElement.forEach((item, index) => {
    assert.equal(item['@type'], 'ListItem')
    assert.equal(item.position, index + 1)
    assert.equal(item.name, expectedNames[index])
    if (index < expectedNames.length - 1) {
      assert.match(item.item, /^https:\/\/www\.fastrack\.school\//)
      assert.equal(new URL(item.item).search, '')
      assert.equal(new URL(item.item).hash, '')
    } else {
      assert.equal('item' in item, false)
    }
  })
}

test('state routes emit one complete clean BreadcrumbList', () => {
  const data = stateBreadcrumbData('Pennsylvania')
  assertGoogleBreadcrumbShape(data, ['Dual credit savings by state', 'Pennsylvania'])
  assert.equal(data.itemListElement[0].item, 'https://www.fastrack.school/savings')
  assert.doesNotThrow(() => JSON.parse(serializeJsonLd(data)))
})

test('selected and default college routes share the supported-state hierarchy', () => {
  for (const collegeName of ['University of Oregon', 'Alabama A & M University']) {
    const data = collegeBreadcrumbData({
      collegeName,
      stateName: collegeName === 'University of Oregon' ? 'Oregon' : 'Alabama',
      statePath: collegeName === 'University of Oregon' ? '/savings/oregon' : '/savings/alabama',
    })
    assertGoogleBreadcrumbShape(data, [
      'Dual credit savings by state',
      collegeName === 'University of Oregon' ? 'Oregon' : 'Alabama',
      collegeName,
    ])
    assert.equal(data.itemListElement[0].item, 'https://www.fastrack.school/savings')
    assert.equal(
      data.itemListElement[1].item,
      collegeName === 'University of Oregon'
        ? 'https://www.fastrack.school/savings/oregon'
        : 'https://www.fastrack.school/savings/alabama',
    )
  }
})

test('territory colleges do not invent an unsupported state directory', () => {
  const data = collegeBreadcrumbData({
    collegeName: 'University of Puerto Rico',
    stateName: 'PR',
    statePath: null,
  })
  assertGoogleBreadcrumbShape(data, ['Fastrack', 'University of Puerto Rico'])
  assert.equal(data.itemListElement[0].item, 'https://www.fastrack.school/')
  assert.equal(serializeJsonLd(data).includes('/savings/puerto-rico'), false)
})

test('JSON-LD serialization cannot terminate its script element', () => {
  const hostile = collegeBreadcrumbData({
    collegeName: '</script><script>alert(1)</script>',
    stateName: 'Test',
    statePath: '/savings/test',
  })
  const serialized = serializeJsonLd(hostile)
  assert.equal(serialized.includes('<'), false)
  assert.equal(serialized.includes('</script>'), false)
  assert.equal(JSON.parse(serialized).itemListElement[2].name, '</script><script>alert(1)</script>')
})

test('only BreadcrumbList is wired to college and state templates', () => {
  const college = fs.readFileSync(new URL('../app/college/[slug]/page.tsx', import.meta.url), 'utf8')
  const state = fs.readFileSync(new URL('../app/savings/[state]/page.tsx', import.meta.url), 'utf8')
  const helper = fs.readFileSync(new URL('../lib/structured-data.mjs', import.meta.url), 'utf8')

  assert.match(college, /collegeBreadcrumbData/)
  assert.match(state, /stateBreadcrumbData/)
  assert.equal((college.match(/<StructuredData /g) ?? []).length, 1)
  assert.equal((state.match(/<StructuredData /g) ?? []).length, 1)
  for (const forbidden of ['AggregateRating', 'Review', 'Offer', 'Product', 'FAQPage', 'EducationalOrganization']) {
    assert.equal(helper.includes(forbidden), false)
  }
})
