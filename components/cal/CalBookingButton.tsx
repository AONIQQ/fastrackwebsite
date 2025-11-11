'use client'

import { useEffect, useMemo } from 'react'
import { getCalApi } from '@calcom/embed-react'
import { Button, type ButtonProps } from '@/components/ui/button'

const DEFAULT_NAMESPACE = '30min'
const DEFAULT_LINK = 'fastrack/30min'
const DEFAULT_LAYOUT_CONFIG = { layout: 'month_view' } as const
const DEFAULT_UI_OPTIONS = {
  cssVarsPerTheme: {
    light: { 'cal-brand': '#090B53' },
    dark: { 'cal-brand': '#F3F4F6' },
  },
  hideEventTypeDetails: false,
  layout: 'month_view',
} as const

export type CalBookingButtonProps = ButtonProps & {
  namespace?: string
  calLink?: string
  calConfig?: Record<string, unknown>
}

const CalBookingButton = ({
  namespace = DEFAULT_NAMESPACE,
  calLink = DEFAULT_LINK,
  calConfig,
  children,
  ...buttonProps
}: CalBookingButtonProps) => {
  useEffect(() => {
    void (async () => {
      const cal = await getCalApi({ namespace })
      cal('ui', DEFAULT_UI_OPTIONS)
    })()
  }, [namespace])

  const serializedConfig = useMemo(() => {
    const mergedConfig = { ...DEFAULT_LAYOUT_CONFIG, ...calConfig }
    return JSON.stringify(mergedConfig)
  }, [calConfig])

  return (
    <Button
      {...buttonProps}
      data-cal-namespace={namespace}
      data-cal-link={calLink}
      data-cal-config={serializedConfig}
    >
      {children}
    </Button>
  )
}

export default CalBookingButton
