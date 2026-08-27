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
  assert.deepEqual(
    ALEXIS_CREATOR_VIDEOS.slice(0, 12),
    [
      { id: 'v001', label: 'The transfer-credit trap' },
      { id: 'v002', label: 'Average net price is not your aid offer' },
      { id: 'v003', label: 'In-state versus out-of-state cost' },
      { id: 'v004', label: 'AP, dual enrollment, or CLEP' },
      { id: 'v005', label: 'When an accepted credit is only an elective' },
      { id: 'v006', label: 'Three checks before enrolling' },
      { id: 'v007', label: 'Model a college-specific cost path' },
      { id: 'v008', label: 'The email to send before enrolling' },
      { id: 'v009', label: 'The two-tab rule' },
      { id: 'v010', label: 'The three-school stress test' },
      { id: 'v011', label: 'Put the credit plan on a calendar' },
      { id: 'v012', label: 'Test the plan against a major change' },
    ],
  )
  assert.deepEqual(
    ALEXIS_CREATOR_VIDEOS.slice(12),
    [
      { id: 'v013', label: 'Map 30 credits to the degree plan' },
      { id: 'v014', label: 'Run one real college through the calculator' },
      { id: 'v015', label: 'Test the projected $60,000 path' },
    ],
  )
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
  assert.equal(alexisCreatorVideoLabel('alexis-v008'), 'The email to send before enrolling')
  assert.equal(alexisCreatorVideoLabel('alexis-v012'), 'Test the plan against a major change')
  assert.equal(alexisCreatorVideoLabel('alexis-v013'), 'Map 30 credits to the degree plan')
  assert.equal(alexisCreatorVideoLabel('alexis-v014'), 'Run one real college through the calculator')
  assert.equal(alexisCreatorVideoLabel('alexis-v015'), 'Test the projected $60,000 path')
  assert.equal(alexisCreatorVideoLabel('alexis-v999'), 'Video V999')
  assert.equal(alexisCreatorVideoLabel('person-5551234567'), null)
})

test('every registered Alexis direct-video route has exact platform attribution', () => {
  for (const platform of ['instagram', 'tiktok', 'facebook', 'youtube']) {
    for (const { id } of ALEXIS_CREATOR_VIDEOS) {
      const destination = new URL(alexisCalculatorUrl({ platform, video: id }))
      assert.equal(destination.origin + destination.pathname, 'https://www.fastrack.school/calculator')
      assert.deepEqual(Object.fromEntries(destination.searchParams), {
        utm_source: platform,
        utm_medium: 'organic',
        utm_campaign: 'creator-20260820',
        utm_content: `alexis-${id}`,
      })
    }
  }
  assert.equal(alexisCalculatorUrl({ platform: 'tiktok', video: 'v016' }), null)
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
  assert.match(route, /NextResponse\.redirect\(destination, 302\)/)
  assert.doesNotMatch(hub + route, /email|phone|viewer|gclid|fbclid/i)
})
