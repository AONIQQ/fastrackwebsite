import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { withAttributionQuery } from '../lib/attribution-url.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('internal offer links preserve bounded acquisition parameters', () => {
  const output = new URL(`https://www.fastrack.school${withAttributionQuery(
    '/credit-map?checkout_ref=opaque-signed-token',
    '?utm_source=google&utm_medium=cpc&utm_campaign=validation&gclid=abc&fbclid=def&email=private',
  )}`)
  assert.equal(output.pathname, '/credit-map')
  assert.equal(output.searchParams.get('checkout_ref'), 'opaque-signed-token')
  assert.equal(output.searchParams.get('utm_source'), 'google')
  assert.equal(output.searchParams.get('utm_medium'), 'cpc')
  assert.equal(output.searchParams.get('utm_campaign'), 'validation')
  assert.equal(output.searchParams.get('gclid'), 'abc')
  assert.equal(output.searchParams.get('fbclid'), 'def')
  assert.equal(output.searchParams.has('email'), false)

  const recordOutput = new URL(`https://www.fastrack.school${withAttributionQuery('/calculator?state=PA', {
    utm_source: 'google',
    utm_campaign: ['not', 'scalar'],
    gclid: 'click-1',
  })}`)
  assert.equal(recordOutput.searchParams.get('state'), 'PA')
  assert.equal(recordOutput.searchParams.get('utm_source'), 'google')
  assert.equal(recordOutput.searchParams.get('gclid'), 'click-1')
  assert.equal(recordOutput.searchParams.has('utm_campaign'), false)
})

test('calculator labels its scenario and surfaces assumptions before capture', async () => {
  const source = await read('../app/calculator/page.tsx')
  assert.match(source, /Modeled dual-credit scenario/)
  assert.match(source, /60 dual-credit hours at \$80 per credit/)
  assert.match(source, /before the email form/)
  assert.match(source, /net price is an average for federal-aid recipients, not your family&?rsquo;s personalized aid/i)
  assert.match(source, /early-earnings and total-advantage figures add two years of College Scorecard median\s+post-enrollment earnings/)
  assert.match(source, /not an individual wage forecast/)
  assert.match(source, /Estimated scenario advantage/)
  assert.match(source, /Explore the \$497 Credit Map/)
  assert.doesNotMatch(source, /With Fastrack/)
  assert.doesNotMatch(source, /back in your pocket/)
  assert.doesNotMatch(source, /Book a free planning session/)
  assert.doesNotMatch(source, /Typical salary|What a degree really costs/)
})

test('homepage describes only the approved Credit Map offer', async () => {
  const source = await read('../app/page.tsx')
  assert.match(source, /For 11th and 12th graders/)
  assert.match(source, /\$497/)
  assert.match(source, /within 7 business days/)
  assert.match(source, /30 days of delivery/)
  assert.match(source, /final transfer and degree-applicability decisions always rest with the receiving college/i)
  assert.doesNotMatch(source, /bachelor(?:&rsquo;|')s degree in two years/i)
  assert.doesNotMatch(source, /Affirm|scholarship|routinely save|\$70,000|eight sessions|open line of communication/i)
})

test('Credit Map preserves price and bounded refund without transfer absolutes', async () => {
  const source = await read('../app/credit-map/page.tsx')
  assert.match(source, /Get Your Credit Map \(\$497\)/)
  assert.match(source, /30-day refund, no questions asked/)
  assert.match(source, /Final\s+transfer decisions always rest with the receiving college/)
  assert.doesNotMatch(source, /CalBookingButton|Book a Free Fit Check/)
  assert.doesNotMatch(source, /every course actually counts|no wasted credits|nothing they take is wasted/i)
})

test('college and state routes qualify costs and keep calculator prefill queries', async () => {
  const [college, state] = await Promise.all([
    read('../app/college/[slug]/page.tsx'),
    read('../app/savings/[state]/page.tsx'),
  ])
  assert.match(college, /modeled scenario/i)
  assert.match(college, /Average net price per year for federal-aid recipients/i)
  assert.match(college, /not your family’s personalized aid offer/i)
  assert.doesNotMatch(college, /What .* Actually Costs|what families actually pay after aid/i)
  assert.match(college, /Residency, course sequencing, catalog timing,\s+and the receiving college/i)
  assert.match(college, /state=\$\{c\.state\}&residency=inState&collegeId=\$\{c\.id\}/)
  assert.doesNotMatch(college, /semester of that you never pay/)
  assert.match(state, /modeled(?: dual-credit)? scenario/i)
  assert.match(state, /average for federal-aid recipients/i)
  assert.match(state, /not a personalized estimate of what your family will pay/i)
  assert.doesNotMatch(state, /What college actually costs|Net price is what families actually pay/i)
  assert.match(state, /calculatorHref\(c\.id\)/)
  assert.match(state, /withAttributionQuery/)
  assert.match(state, /<table className="block w-full[^\"]*md:table/)
  assert.match(state, /<tbody className="block md:table-row-group">/)
  assert.match(state, /<tr key=\{c\.id\} className="grid grid-cols-1[^\"]*md:table-row/)
  assert.match(state, /className="inline-flex min-h-11 w-full[^\"]*md:w-auto[^\"]*"/)
  assert.doesNotMatch(state, /overflow-x-auto/)
  assert.doesNotMatch(state, /The fix is|exactly what a Fastrack Credit Map does|semester .* you never pay/i)
})

test('guide retains its price but makes no time, savings, applicability, or fulfillment promise', async () => {
  const source = await read('../app/guide/page.tsx')
  assert.match(source, /Fastrack Guide \(\$47\)/)
  assert.match(source, /Policies and course applicability vary by state, school, major, and catalog year/)
  assert.doesNotMatch(source, /Graduate College in 2 Years|Save Up to 50%|tens of thousands|Works in any U\.S\. state|straight-A|shave off a year|Instant Download|lifetime access|updates included|7 days|on track/i)
})

test('state and nurture copy do not overstate course-specific denial rates', async () => {
  const [state, nurture] = await Promise.all([
    read('../app/savings/[state]/page.tsx'),
    read('../lib/nurture.ts'),
  ])

  for (const source of [state, nurture]) {
    assert.doesNotMatch(source, /College Algebra[\s\S]{0,160}more than half/i)
    assert.doesNotMatch(source, /intro economics[\s\S]{0,160}more than half/i)
  }
})
