import { serializeJsonLd } from '@/lib/structured-data.mjs'

export default function StructuredData({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}
