export function scheduleCaptureDelivery(waitUntilFn, deliveryPromise, onFailure) {
  const guardedDelivery = Promise.resolve(deliveryPromise).catch(onFailure)
  try {
    waitUntilFn(guardedDelivery)
    return true
  } catch {
    onFailure()
    return false
  }
}
