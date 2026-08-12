import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { withAttributionQuery } from '../lib/attribution-url.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('homepage calculator continuation preserves only approved acquisition parameters', () => {
  const output = new URL(`https://www.fastrack.school${withAttributionQuery(
    '/calculator',
    '?utm_source=reddit&utm_medium=organic&utm_campaign=agent-20260812&gclid=click-1&fbclid=click-2&email=private',
  )}`)

  assert.equal(output.pathname, '/calculator')
  assert.equal(output.searchParams.get('utm_source'), 'reddit')
  assert.equal(output.searchParams.get('utm_medium'), 'organic')
  assert.equal(output.searchParams.get('utm_campaign'), 'agent-20260812')
  assert.equal(output.searchParams.get('gclid'), 'click-1')
  assert.equal(output.searchParams.get('fbclid'), 'click-2')
  assert.equal(output.searchParams.has('email'), false)
})

test('homepage exposes one semantic free-calculator action above the fold and in navigation', async () => {
  const source = await read('../app/page.tsx')

  assert.match(source, /const \[calculatorHref, setCalculatorHref\] = useState\('\/calculator'\)/)
  assert.match(source, /setCalculatorHref\(withAttributionQuery\('\/calculator', window\.location\.search\)\)/)
  assert.match(source, /<Link href=\{calculatorHref\}>\s*Calculator\s*<\/Link>/)
  assert.match(source, /<Link href=\{calculatorHref\}>\s*Try the free calculator\s*<\/Link>/)
  assert.doesNotMatch(source, /<Link[^>]*>\s*<Button/)
})

test('mobile navigation is named, stateful, and provides 44-pixel targets', async () => {
  const source = await read('../app/page.tsx')

  assert.match(source, /className="md:hidden min-h-11 min-w-11/)
  assert.match(source, /aria-expanded=\{isMenuOpen\}/)
  assert.match(source, /aria-controls="mobile-navigation"/)
  assert.match(source, /<nav id="mobile-navigation" aria-label="Mobile navigation"/)
  assert.equal((source.match(/className="min-h-11 text-white text-base"/g) ?? []).length, 2)
})
