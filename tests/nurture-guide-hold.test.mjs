import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

async function applicationSources(directory = new URL('../app/', import.meta.url)) {
  const entries = await readdir(directory, { withFileTypes: true })
  const sources = []

  for (const entry of entries) {
    if (entry.name === 'guide') continue
    const path = new URL(entry.name, directory)
    if (entry.isDirectory()) {
      sources.push(...await applicationSources(new URL(`${path.href}/`)))
    } else if (/\.(?:ts|tsx)$/.test(entry.name) && entry.name !== 'sitemap.ts') {
      sources.push(await readFile(path, 'utf8'))
    }
  }

  return sources
}

test('nurture keeps its schedule and uses the approved $47 to $497 offer ladder', async () => {
  const source = await read('../lib/nurture.ts')

  for (const [stage, afterDays] of [[1, 2], [2, 5], [3, 8], [4, 12]]) {
    assert.match(source, new RegExp(`stage: ${stage},\\s+afterDays: ${afterDays},`))
  }
  assert.match(source, /Three checks before dual credit counts as savings/)
  assert.match(source, /Whether the course applies to the intended degree/)
  assert.match(source, /Whether it is the right course or sequence/)
  assert.match(source, /Whether it satisfies both plans/)
  assert.match(source, /can reduce college costs, but only when/i)
  assert.doesNotMatch(source, /Dual credit saves real money|The class was paid for twice|means retaking it/)
  assert.match(source, /guide\?\$\{U\('n2'\)\}/)
  assert.match(source, /Review the Fastrack Guide \(\$47\)/)
  assert.match(source, /educational material, not a personalized course map or a promise/i)
  assert.match(source, /verify not only whether each course transfers, but whether it applies to the intended degree/i)
  assert.doesNotMatch(source, /1 in 7|one in seven/i)
  assert.match(source, /Get Your Credit Map \(\$497\)/)
  assert.match(source, /maps each proposed course to the requirements it may satisfy/)
  assert.match(source, /sources every verified transfer line/)
  assert.match(source, /flags anything that still needs confirmation/)
  assert.match(source, /credit-map\?\$\{U\('n4'\)\}/)
  assert.doesNotMatch(source, /lead_ref|prefilled_email/)
  assert.match(source, /Final transfer and degree-applicability decisions rest with those institutions/)
  assert.doesNotMatch(source, /every course checked against|planning either happened or it did not|one step that protects all the others/i)
  assert.match(source, /Fastrack EDU LLC &middot;/)
  assert.match(source, /BUSINESS_POSTAL_ADDRESS/)
  assert.match(source, /step\.stage >= 2/)
  assert.match(source, /Advertisement from Fastrack EDU LLC/)
  assert.match(source, /business_postal_address_invalid/)
  assert.doesNotMatch(source, /Fastrack LLC &middot;/)
  assert.doesNotMatch(source, /free guide|weekend|instant download|guarantee(?:d)? transfer/i)
})

test('the guide remains a truthful source route and no unrelated app route promotes it', async () => {
  const [guide, sitemap, ...sources] = await Promise.all([
    read('../app/guide/page.tsx'),
    read('../app/sitemap.ts'),
    ...await applicationSources(),
  ])

  assert.match(guide, /Fastrack Guide \(\$47\)/)
  assert.match(sitemap, /'\/guide'/)
  for (const source of sources) assert.doesNotMatch(source, /["'`]\/guide(?:[?"'`])/)
})
