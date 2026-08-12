export function statePageMetadata(name, slug) {
  return {
    title: `Modeled Dual Credit Costs in ${name} | Fastrack`,
    description: `Real net-price data for ${name} colleges and a modeled dual-credit cost scenario with transfer and degree-applicability limitations.`,
    alternates: { canonical: `/savings/${slug}` },
  }
}
