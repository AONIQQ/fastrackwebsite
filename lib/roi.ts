import type { CollegeRow } from './db'

/**
 * ROI model for the calculator.
 *
 * The point of the tool is the contrast: doing college the normal way is
 * enormously expensive and takes a long time to pay back. So both paths are
 * computed side by side against the same inputs, the standard number is the
 * pain, the Fastrack number is the relief, and the gap between them is the
 * pitch. Nothing here softens the standard figure; it is computed honestly and
 * it is large because it is genuinely large.
 *
 * Three things this fixes versus the original client-side math:
 *
 * 1. It uses average NET PRICE, not published tuition. Net price is full cost of
 *    attendance minus grant aid, the number a family actually pays. It is
 *    usually HIGHER than tuition (Penn State: $20,644 tuition vs $32,875 net),
 *    because tuition excludes housing, food and books. So this is both more
 *    defensible and a bigger, truer pain number.
 *
 * 2. The old "potential savings" was `total / 2`, a flat halving asserted as a
 *    calculation. The accelerated path is now modelled properly: two years of
 *    real campus cost plus the real cost of the dual-credit hours that replace
 *    the other two.
 *
 * 3. It counts the two years of EARLY EARNINGS. Graduating two years sooner
 *    means two extra years of salary, which is the larger half of the case and
 *    the old tool never showed it at all.
 */

export type Residency = 'inState' | 'outOfState'

export type RoiAssumptions = {
  standardYears: number
  fastrackYears: number
  dualCreditCredits: number
  dualCreditCostPerCredit: number
}

export const DEFAULT_ASSUMPTIONS: RoiAssumptions = {
  standardYears: 4,
  fastrackYears: 2,
  dualCreditCredits: 60,
  // $80/credit is the dual-credit average cited in the Fastrack deck. The guide
  // documents real cases at $25-40. The conservative figure is used so the
  // savings number is never overstated.
  dualCreditCostPerCredit: 80,
}

export type PathResult = {
  years: number
  totalCost: number
  yearsToRecoup: number | null
  /** Null when discretionary income is zero or negative. */
  recoupLabel: string
}

export type RoiResult = {
  college: { id: number; name: string; state: string; city: string | null }
  residency: Residency
  costBasis: 'net_price' | 'published_tuition'
  annualCost: number
  averageSalary: number | null
  costOfLiving: number | null
  discretionaryIncome: number | null
  standard: PathResult
  fastrack: PathResult
  savings: number
  yearsSaved: number
  earlyEarnings: number | null
  totalAdvantage: number | null
  assumptions: RoiAssumptions
  notes: string[]
}

/**
 * Scorecard reports one net price per institution, not split by residency,
 * while tuition IS split. Approximate the out-of-state net price by adding the
 * published tuition differential on top.
 */
function annualCostFor(college: CollegeRow, residency: Residency): { cost: number; basis: RoiResult['costBasis'] } {
  const { net_price, tuition_in, tuition_out } = college

  if (net_price != null) {
    if (residency === 'outOfState' && tuition_in != null && tuition_out != null) {
      return { cost: net_price + Math.max(tuition_out - tuition_in, 0), basis: 'net_price' }
    }
    return { cost: net_price, basis: 'net_price' }
  }

  const sticker = residency === 'inState' ? tuition_in : tuition_out
  return { cost: sticker ?? 0, basis: 'published_tuition' }
}

export function computeRoi(
  college: CollegeRow & { cost_of_living?: number | null },
  residency: Residency,
  overrides: Partial<RoiAssumptions> = {},
): RoiResult {
  const a = { ...DEFAULT_ASSUMPTIONS, ...overrides }
  const notes: string[] = []

  const { cost: annualCost, basis } = annualCostFor(college, residency)

  if (basis === 'published_tuition') {
    notes.push(
      'Average net price is not reported for this school, so published tuition is used. This understates the real cost, which also includes housing, food and books.',
    )
  } else {
    notes.push(
      'Cost is based on average net price, full cost of attendance minus grant aid, which is what families actually pay.',
    )
  }

  const salary =
    college.earnings_6yr != null && college.earnings_10yr != null
      ? Math.round((college.earnings_6yr + college.earnings_10yr) / 2)
      : (college.earnings_6yr ?? college.earnings_10yr ?? null)

  const costOfLiving = college.cost_of_living ?? null
  const discretionaryIncome =
    salary != null && costOfLiving != null ? salary - costOfLiving : null

  if (salary == null) notes.push('No post-enrollment earnings are reported for this school.')
  if (costOfLiving == null) notes.push('No cost-of-living figure is available for this state.')

  const standardCost = Math.round(annualCost * a.standardYears)
  const dualCreditCost = a.dualCreditCredits * a.dualCreditCostPerCredit
  const fastrackCost = Math.round(annualCost * a.fastrackYears + dualCreditCost)

  const path = (years: number, totalCost: number): PathResult => {
    if (discretionaryIncome == null) {
      return { years, totalCost, yearsToRecoup: null, recoupLabel: 'Not enough data' }
    }
    if (discretionaryIncome <= 0) {
      return {
        years,
        totalCost,
        yearsToRecoup: null,
        recoupLabel: 'Never, typical earnings do not exceed cost of living',
      }
    }
    const y = Math.round((totalCost / discretionaryIncome) * 10) / 10
    return {
      years,
      totalCost,
      yearsToRecoup: y,
      recoupLabel: `${y.toLocaleString()} ${y === 1 ? 'year' : 'years'}`,
    }
  }

  const yearsSaved = Math.max(a.standardYears - a.fastrackYears, 0)
  const earlyEarnings = salary != null ? salary * yearsSaved : null
  const savings = Math.max(standardCost - fastrackCost, 0)

  return {
    college: { id: college.id, name: college.name, state: college.state, city: college.city },
    residency,
    costBasis: basis,
    annualCost,
    averageSalary: salary,
    costOfLiving,
    discretionaryIncome,
    standard: path(a.standardYears, standardCost),
    fastrack: path(a.fastrackYears, fastrackCost),
    savings,
    yearsSaved,
    earlyEarnings,
    totalAdvantage: earlyEarnings != null ? savings + earlyEarnings : null,
    assumptions: a,
    notes,
  }
}
