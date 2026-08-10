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

test('nurture keeps its schedule and useful copy without promoting the guide', async () => {
  const source = await read('../lib/nurture.ts')

  for (const [stage, afterDays] of [[1, 2], [2, 5], [3, 8], [4, 12]]) {
    assert.match(source, new RegExp(`stage: ${stage},\\s+afterDays: ${afterDays},`))
  }
  assert.match(source, /Courses that transfer but do not count/)
  assert.match(source, /The wrong version of the right course/)
  assert.match(source, /Planning against the wrong requirements/)
  assert.match(source, /credit-map\?\$\{U\('n4'\)\}/)
  assert.doesNotMatch(source, /lead_ref|prefilled_email/)
  assert.match(source, /check every course against the target college’s transfer rules before enrolling/)
  assert.doesNotMatch(source, /\/guide|Fastrack Guide|free guide|weekend|Get the Fastrack Guide|\$47/)
})

test('the guide is direct-only but remains a source route and sitemap entry', async () => {
  const [guide, sitemap, ...sources] = await Promise.all([
    read('../app/guide/page.tsx'),
    read('../app/sitemap.ts'),
    ...await applicationSources(),
  ])

  assert.match(guide, /Fastrack Guide \(\$47\)/)
  assert.match(sitemap, /'\/guide'/)
  for (const source of sources) assert.doesNotMatch(source, /["'`]\/guide(?:[?"'`])/)
})
