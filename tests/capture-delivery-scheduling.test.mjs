import assert from 'node:assert/strict'
import test from 'node:test'
import { scheduleCaptureDelivery } from '../lib/capture-delivery-scheduling.mjs'

test('a synchronous waitUntil failure cannot overturn a durable capture response', async () => {
  const failures = []
  let deliveryCompleted = false
  const delivery = Promise.resolve().then(() => { deliveryCompleted = true })

  assert.equal(scheduleCaptureDelivery(
    () => { throw new Error('platform scheduling unavailable') },
    delivery,
    () => failures.push('scheduling'),
  ), false)

  await delivery
  assert.equal(deliveryCompleted, true)
  assert.deepEqual(failures, ['scheduling'])
})

test('a rejected delivery is contained after successful scheduling', async () => {
  const failures = []
  let scheduled
  assert.equal(scheduleCaptureDelivery(
    (promise) => { scheduled = promise },
    Promise.reject(new Error('provider unavailable')),
    () => failures.push('delivery'),
  ), true)

  await scheduled
  assert.deepEqual(failures, ['delivery'])
})
