const money = (value) => value == null ? '-' : `$${Math.round(value).toLocaleString('en-US')}`

export function describeResultCostBasis(result) {
  const detail = result.costBasisDetail
  switch (detail?.kind) {
    case 'reported_average_net_price':
      return `The annual cost input is the College Scorecard average net price for federal-aid recipients (${money(detail.reportedNetPrice)}), not a personalized aid offer.`
    case 'out_of_state_adjusted_net_price':
      return `The out-of-state annual cost input is an approximation: the College Scorecard average net price for federal-aid recipients (${money(detail.reportedNetPrice)}) plus the published out-of-state versus in-state tuition difference (${money(detail.tuitionDifferential)}), for ${money(result.annualCost)}. It is not a personalized aid offer.`
    case 'published_in_state_tuition':
      return `Average net price is unavailable, so the annual cost input uses published in-state tuition (${money(detail.publishedTuition)}). It excludes costs such as housing, food, and books.`
    case 'published_out_of_state_tuition':
      return `Average net price is unavailable, so the annual cost input uses published out-of-state tuition (${money(detail.publishedTuition)}). It excludes costs such as housing, food, and books.`
    default:
      return `This stored result does not identify whether its ${money(result.annualCost)} annual cost input used average net price, an out-of-state adjustment, or published tuition.`
  }
}

export function describeResultEarningsBasis(result) {
  switch (result.earningsBasis?.kind) {
    case 'six_year':
      return `The annual earnings input is the College Scorecard 6-year median earnings after entry (${money(result.averageSalary)}). It is not an individual wage forecast.`
    case 'ten_year':
      return `The annual earnings input is the College Scorecard 10-year median earnings after entry (${money(result.averageSalary)}). It is not an individual wage forecast.`
    case 'average_six_and_ten_year':
      return `The annual earnings input (${money(result.averageSalary)}) is the rounded arithmetic average of the College Scorecard 6-year median (${money(result.earningsBasis.earnings6Year)}) and 10-year median (${money(result.earningsBasis.earnings10Year)}) after entry. It is not an individual wage forecast.`
    case 'unavailable':
      return 'College Scorecard earnings are unavailable, so this result does not calculate early earnings or payback time.'
    default:
      return 'This stored result does not identify whether its earnings input came from the 6-year median, 10-year median, or their rounded arithmetic average.'
  }
}

export function describeResultPaybackBasis(result) {
  switch (result.paybackBasis?.availability) {
    case 'available':
      return `Modeled payback time divides each path cost by annual median earnings (${money(result.averageSalary)}) minus the state cost-of-living input (${money(result.costOfLiving)}), leaving ${money(result.discretionaryIncome)} per year.`
    case 'non_positive_discretionary_income':
      return `Modeled payback time has no finite value because annual median earnings (${money(result.averageSalary)}) minus the state cost-of-living input (${money(result.costOfLiving)}) is not positive.`
    case 'earnings_unavailable':
      return 'Modeled payback time is unavailable because the annual earnings input is unavailable.'
    case 'cost_of_living_unavailable':
      return 'Modeled payback time is unavailable because the state cost-of-living input is unavailable.'
    default:
      return 'This stored result does not contain the inputs needed to restate its payback calculation. The displayed value was calculated when the result was captured.'
  }
}
