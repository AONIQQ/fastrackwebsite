import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  FASTTRACK_SOCIAL_CAMPAIGN,
  FASTTRACK_SOCIAL_PLATFORMS,
  creatorAccountLabel,
  fastrackSocialCalculatorUrl,
  fastrackSocialPlatform,
} from '../lib/fastrack-social.mjs'

test('Fastrack brand profile links emit bounded account attribution', () => {
  assert.equal(FASTTRACK_SOCIAL_CAMPAIGN, 'creator-20260830')
  assert.deepEqual(FASTTRACK_SOCIAL_PLATFORMS, ['instagram', 'tiktok', 'facebook'])
  for (const platform of FASTTRACK_SOCIAL_PLATFORMS) {
    const destination = new URL(fastrackSocialCalculatorUrl({ platform }))
    assert.equal(destination.origin + destination.pathname, 'https://www.fastrack.school/calculator')
    assert.deepEqual(Object.fromEntries(destination.searchParams), {
      utm_source: platform,
      utm_medium: 'organic',
      utm_campaign: 'creator-20260830',
      utm_content: 'calculator',
    })
  }
  assert.equal(fastrackSocialPlatform(' Instagram '), 'instagram')
  assert.equal(fastrackSocialCalculatorUrl({ platform: 'youtube' }), null)
  assert.equal(fastrackSocialCalculatorUrl({ platform: 'snapchat' }), null)
  assert.equal(creatorAccountLabel({ campaign: 'creator-20260830', content: 'calculator' }), 'Fastrack profile link')
  assert.equal(creatorAccountLabel({ campaign: 'creator-20260820', content: 'calculator' }), null)
})

test('Fastrack brand route fails closed to the untagged calculator', async () => {
  const route = await readFile(new URL('../app/fastrack/route.ts', import.meta.url), 'utf8')
  assert.match(route, /fastrackSocialCalculatorUrl/)
  assert.match(route, /NextResponse\.redirect\(new URL\('\/calculator'/)
  assert.match(route, /NextResponse\.redirect\(destination, 302\)/)
  assert.doesNotMatch(route, /email|phone|viewer|gclid|fbclid/i)
})
