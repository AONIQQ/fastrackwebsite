import assert from 'node:assert/strict'
import test from 'node:test'
import { captureLatencyBucket, slowCaptureDiagnostic } from '../lib/capture-observability.mjs'

test('capture latency uses fixed privacy-safe buckets and logs only slow outcomes', () => {
  assert.equal(captureLatencyBucket(4_999), 'under_5s')
  assert.equal(captureLatencyBucket(5_000), '5_to_10s')
  assert.equal(captureLatencyBucket(10_000), '10_to_20s')
  assert.equal(captureLatencyBucket(20_000), '20s_or_more')
  assert.equal(slowCaptureDiagnostic(4_999, 'acknowledged'), null)
  assert.deepEqual(slowCaptureDiagnostic(10_001, 'acknowledged'), {
    event: 'capture_slow', version: 1, outcome: 'acknowledged', latency_bucket: '10_to_20s',
  })
  assert.doesNotMatch(JSON.stringify(slowCaptureDiagnostic(25_000, 'failed')), /email|phone|capture_id|college|request/i)
})

test('capture latency rejects unbounded values and outcomes', () => {
  assert.throws(() => captureLatencyBucket(Number.NaN), TypeError)
  assert.throws(() => captureLatencyBucket(-1), TypeError)
  assert.throws(() => slowCaptureDiagnostic(5_000, 'unknown'), TypeError)
})
