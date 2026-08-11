const EXPERIMENTS = Object.freeze({
  209551: Object.freeze({
    canonicalPath: '/college/209551-university-of-oregon',
    searchName: 'University of Oregon',
  }),
  218672: Object.freeze({
    canonicalPath: '/college/218672-university-of-south-carolina-lancaster',
    searchName: 'USC Lancaster',
  }),
  100663: Object.freeze({
    canonicalPath: '/college/100663-university-of-alabama-at-birmingham',
    searchName: 'UAB',
  }),
})

const money = (value) => value == null ? null : `$${Math.round(value).toLocaleString('en-US')}`
export function collegeSeoExperiment(id) {
  return EXPERIMENTS[id] ?? null
}

export function collegeSeoMetadata(college) {
  const experiment = collegeSeoExperiment(college.id)
  if (!experiment) return null

  const netPrice = money(college.net_price)
  const tuition = money(college.tuition_in)
  const valueSummary = tuition
    ? `${tuition} published in-state tuition`
    : netPrice
      ? `${netPrice} average net price for federal-aid recipients`
      : 'current College Scorecard cost fields'

  return {
    title: `${experiment.searchName} Cost and Tuition | Fastrack`,
    description: `${experiment.searchName} cost: ${valueSummary}. Compare it with average net price and a qualified dual-credit cost scenario.`,
    canonicalPath: experiment.canonicalPath,
  }
}

export function collegeSeoOpening(college) {
  const experiment = collegeSeoExperiment(college.id)
  if (!experiment) return null

  const tuitionParts = [
    college.tuition_in == null ? null : `${money(college.tuition_in)} for in-state students`,
    college.tuition_out == null ? null : `${money(college.tuition_out)} for out-of-state students`,
  ].filter(Boolean)
  const tuitionSentence = tuitionParts.length
    ? `${college.name} reports published tuition of ${tuitionParts.join(' and ')}.`
    : `Published tuition is not available in the current College Scorecard row for ${college.name}.`
  const netPriceSentence = college.net_price == null
    ? 'Average net price is not available in the current College Scorecard row.'
    : `The College Scorecard reports an average net price of ${money(college.net_price)} per year for federal-aid recipients after grant and scholarship aid.`
  return {
    heading: `How much does ${experiment.searchName} cost?`,
    answer: `${tuitionSentence} ${netPriceSentence} Published tuition and average net price are different measures, and neither is your family’s personalized aid offer. College Scorecard fields can reflect different reporting periods and can change.`,
    calculatorCta: `Compare ${experiment.searchName} cost scenarios`,
  }
}
