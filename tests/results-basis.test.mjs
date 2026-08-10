import assert from 'node:assert/strict'
import test from 'node:test'
import {
  describeResultCostBasis,
  describeResultEarningsBasis,
  describeResultPaybackBasis,
} from '../lib/results-basis.mjs'

const base = {
  annualCost: 30_000,
  averageSalary: 60_000,
  costOfLiving: 40_000,
  discretionaryIncome: 20_000,
}

test('cost copy identifies every server-derived basis and exact inputs', () => {
  const cases = [
    [{ kind: 'reported_average_net_price', reportedNetPrice: 20_000 }, /average net price.*\$20,000.*not a personalized aid offer/],
    [{ kind: 'out_of_state_adjusted_net_price', reportedNetPrice: 20_000, tuitionDifferential: 10_000 }, /approximation.*\$20,000.*\$10,000.*\$30,000/],
    [{ kind: 'published_in_state_tuition', publishedTuition: 18_000 }, /published in-state tuition \(\$18,000\).*excludes/],
    [{ kind: 'published_out_of_state_tuition', publishedTuition: 28_000 }, /published out-of-state tuition \(\$28,000\).*excludes/],
  ]
  for (const [costBasisDetail, pattern] of cases) {
    assert.match(describeResultCostBasis({ ...base, costBasisDetail }), pattern)
  }
})

test('earnings copy identifies 6-year, 10-year, averaged, unavailable, and legacy bases', () => {
  assert.match(describeResultEarningsBasis({ ...base, earningsBasis: { kind: 'six_year' } }), /6-year median.*\$60,000/)
  assert.match(describeResultEarningsBasis({ ...base, earningsBasis: { kind: 'ten_year' } }), /10-year median.*\$60,000/)
  assert.match(describeResultEarningsBasis({
    ...base,
    averageSalary: 60_001,
    earningsBasis: { kind: 'average_six_and_ten_year', earnings6Year: 50_001, earnings10Year: 70_000 },
  }), /\$60,001.*rounded arithmetic average.*\$50,001.*\$70,000/)
  assert.match(describeResultEarningsBasis({ ...base, earningsBasis: { kind: 'unavailable' } }), /earnings are unavailable/)
  assert.match(describeResultEarningsBasis(base), /stored result does not identify/)
})

test('payback copy defines exact denominator and handles unavailable boundaries', () => {
  assert.match(describeResultPaybackBasis({ ...base, paybackBasis: { availability: 'available' } }), /divides each path cost.*\$60,000.*minus.*\$40,000.*\$20,000 per year/)
  assert.match(describeResultPaybackBasis({ ...base, discretionaryIncome: 0, paybackBasis: { availability: 'non_positive_discretionary_income' } }), /no finite value.*not positive/)
  assert.match(describeResultPaybackBasis({ ...base, paybackBasis: { availability: 'earnings_unavailable' } }), /earnings input is unavailable/)
  assert.match(describeResultPaybackBasis({ ...base, paybackBasis: { availability: 'cost_of_living_unavailable' } }), /cost-of-living input is unavailable/)
  assert.match(describeResultPaybackBasis(base), /stored result does not contain the inputs/)
})

test('legacy snapshots disclose unknown bases without inventing one', () => {
  const legacy = { annualCost: 12_345, averageSalary: 50_000 }
  assert.match(describeResultCostBasis(legacy), /does not identify whether.*\$12,345.*average net price.*out-of-state adjustment.*published tuition/)
  assert.doesNotMatch(describeResultCostBasis(legacy), /uses published|input is the College/)
})
