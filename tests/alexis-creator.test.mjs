import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  ALEXIS_CREATOR_CAMPAIGN,
  ALEXIS_CREATOR_VIDEOS,
  alexisCalculatorUrl,
  alexisCreatorContent,
  alexisCreatorPlatform,
  alexisCreatorVideoLabel,
} from '../lib/alexis-creator.mjs'

test('Alexis links emit only bounded platform and opaque video attribution', () => {
  assert.equal(ALEXIS_CREATOR_CAMPAIGN, 'creator-20260820')
  assert.equal(ALEXIS_CREATOR_VIDEOS.length, 7)
  const link = new URL(alexisCalculatorUrl({ platform: 'TikTok', video: 'V001' }))
  assert.equal(link.origin + link.pathname, 'https://www.fastrack.school/calculator')
  assert.deepEqual(Object.fromEntries(link.searchParams), {
    utm_source: 'tiktok', utm_medium: 'organic', utm_campaign: 'creator-20260820', utm_content: 'alexis-v001',
  })
  assert.equal(alexisCalculatorUrl({ platform: 'snapchat', video: 'v001' }), null)
  assert.equal(alexisCalculatorUrl({ platform: 'instagram', video: 'v999' }), null)
  assert.equal(alexisCreatorContent('Alexis Luhr'), null)
  assert.equal(alexisCreatorPlatform('facebook'), 'facebook')
  assert.equal(alexisCreatorVideoLabel('alexis-v007'), 'Model a college-specific cost path')
  assert.equal(alexisCreatorVideoLabel('alexis-v999'), 'Video V999')
  assert.equal(alexisCreatorVideoLabel('person-5551234567'), null)
})

test('Alexis route and hub use only the bounded shared contract', async () => {
  const [hub, route] = await Promise.all([
    readFile(new URL('../app/alexis/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/alexis/[video]/route.ts', import.meta.url), 'utf8'),
  ])
  assert.match(hub, /alexisCreatorPlatform\(searchParams\.source\)/)
  assert.match(hub, /ALEXIS_CREATOR_VIDEOS\.map/)
  assert.match(route, /alexisCalculatorUrl/)
  assert.match(route, /NextResponse\.redirect\(new URL\('\/alexis'/)
  assert.doesNotMatch(hub + route, /email|phone|viewer|gclid|fbclid/i)
})
