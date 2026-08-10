import { permanentRedirect } from 'next/navigation'
import { retiredRouteDestination } from '@/lib/retired-route-url.mjs'

export default function SignUpPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  permanentRedirect(retiredRouteDestination('/calculator', searchParams, true))
}
