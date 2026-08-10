import { permanentRedirect } from 'next/navigation'
import { retiredRouteDestination } from '@/lib/retired-route-url.mjs'

export default function PricingPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  permanentRedirect(retiredRouteDestination('/credit-map', searchParams))
}
