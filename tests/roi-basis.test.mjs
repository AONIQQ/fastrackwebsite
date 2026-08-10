import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../lib/roi.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleShim = { exports: {} }
new Function('exports', 'module', 'require', compiled)(moduleShim.exports, moduleShim, () => {
  throw new Error('roi.ts must not have runtime imports')
})
const { computeRoi } = moduleShim.exports

const college = (overrides = {}) => ({
  id: 1, name: 'Example College', city: 'Town', state: 'PA', ownership: 1,
  tuition_in: 20_000, tuition_out: 30_000, net_price: 25_000,
  earnings_6yr: 50_001, earnings_10yr: 70_000, cost_of_living: 40_000,
  ...overrides,
})

test('ROI snapshot preserves all cost-basis variants without changing annual cost', () => {
  const net = computeRoi(college(), 'inState')
  assert.equal(net.annualCost, 25_000)
  assert.deepEqual(net.costBasisDetail, { kind: 'reported_average_net_price', reportedNetPrice: 25_000, publishedTuition: null, tuitionDifferential: null })

  const adjusted = computeRoi(college(), 'outOfState')
  assert.equal(adjusted.annualCost, 35_000)
  assert.deepEqual(adjusted.costBasisDetail, { kind: 'out_of_state_adjusted_net_price', reportedNetPrice: 25_000, publishedTuition: null, tuitionDifferential: 10_000 })
  assert.match(adjusted.notes[0], /approximated.*published tuition difference.*federal-aid recipients/)

  const inTuition = computeRoi(college({ net_price: null }), 'inState')
  assert.equal(inTuition.annualCost, 20_000)
  assert.equal(inTuition.costBasisDetail.kind, 'published_in_state_tuition')
  assert.match(inTuition.notes[0], /published in-state tuition.*excludes costs/)

  const outTuition = computeRoi(college({ net_price: null }), 'outOfState')
  assert.equal(outTuition.annualCost, 30_000)
  assert.equal(outTuition.costBasisDetail.kind, 'published_out_of_state_tuition')
})

test('ROI snapshot preserves exact earnings source and rounded arithmetic average', () => {
  const both = computeRoi(college(), 'inState')
  assert.equal(both.averageSalary, 60_001)
  assert.deepEqual(both.earningsBasis, { kind: 'average_six_and_ten_year', earnings6Year: 50_001, earnings10Year: 70_000 })
  assert.equal(computeRoi(college({ earnings_10yr: null }), 'inState').earningsBasis.kind, 'six_year')
  assert.equal(computeRoi(college({ earnings_6yr: null }), 'inState').earningsBasis.kind, 'ten_year')
  assert.equal(computeRoi(college({ earnings_6yr: null, earnings_10yr: null }), 'inState').earningsBasis.kind, 'unavailable')
})

test('ROI snapshot preserves payback definition and non-positive boundary', () => {
  const available = computeRoi(college(), 'inState')
  assert.deepEqual(available.paybackBasis, {
    definition: 'path_cost_divided_by_annual_median_earnings_minus_state_cost_of_living',
    availability: 'available',
  })
  assert.equal(available.discretionaryIncome, 20_001)
  assert.equal(available.standard.yearsToRecoup, 5)

  const nonPositive = computeRoi(college({ earnings_6yr: 30_000, earnings_10yr: null }), 'inState')
  assert.equal(nonPositive.paybackBasis.availability, 'non_positive_discretionary_income')
  assert.equal(nonPositive.standard.yearsToRecoup, null)
  assert.match(nonPositive.standard.recoupLabel, /Never/)

  const noLiving = computeRoi(college({ cost_of_living: null }), 'inState')
  assert.equal(noLiving.paybackBasis.availability, 'cost_of_living_unavailable')
  assert.equal(noLiving.standard.yearsToRecoup, null)
})
